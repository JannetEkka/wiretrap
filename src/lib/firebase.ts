import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  type DocumentData,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type {
  AgentTarget,
  ToolDefinition,
  TargetChatMessage,
  DetonationRun,
  RemediationFinding,
  TargetPromptVersion,
} from '../types';
import { normalizeToolParameters } from './schemaNormalizer';

// Initialize Firebase App singleton
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Initialize Firestore with specific database ID if provided
export const db =
  firebaseConfig.firestoreDatabaseId &&
  firebaseConfig.firestoreDatabaseId !== '(default)'
    ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
    : getFirestore(app);

// Authentication helpers
export const signInWithGoogle = async (): Promise<User> => {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
};

export const logoutUser = async (): Promise<void> => {
  await signOut(auth);
};

// Target operations: users/{userId}/targets/{targetId}
export const saveAgentTarget = async (
  userId: string,
  data: {
    name: string;
    systemPrompt: string;
    tools: ToolDefinition[];
    isVulnerableSample?: boolean;
    warningLabel?: string;
  }
): Promise<string> => {
  const targetsCollection = collection(db, 'users', userId, 'targets');
  const now = Date.now();
  
  // Clean tools array: strip any undefined fields and ensure normalized schema for parameters
  const sanitizedTools = data.tools.map((tool, idx) => {
    const norm = normalizeToolParameters(tool.parameters);
    return {
      id: tool.id || `tool-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
      name: (tool.name || '').trim(),
      description: (tool.description || '').trim(),
      parameters: norm ? JSON.stringify(norm, null, 2) : (tool.parameters || '{}').trim(),
    };
  });

  const payload: Record<string, any> = {
    userId,
    name: data.name.trim(),
    systemPrompt: data.systemPrompt.trim(),
    tools: sanitizedTools,
    promptVersion: 1,
    createdAt: now,
    updatedAt: now,
    serverCreatedAt: serverTimestamp(),
  };

  if (typeof data.isVulnerableSample === 'boolean') {
    payload.isVulnerableSample = data.isVulnerableSample;
  }
  if (data.warningLabel) {
    payload.warningLabel = data.warningLabel;
  }

  const docRef = await addDoc(targetsCollection, payload);

  return docRef.id;
};

export const subscribeUserTargets = (
  userId: string,
  onData: (targets: AgentTarget[]) => void,
  onError: (err: Error) => void
) => {
  const targetsCollection = collection(db, 'users', userId, 'targets');
  const q = query(targetsCollection, orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: AgentTarget[] = snapshot.docs.map((d) => {
        const item = d.data() as DocumentData;
        return {
          id: d.id,
          userId: item.userId || userId,
          name: item.name || 'Unnamed Agent',
          systemPrompt: item.systemPrompt || '',
          tools: item.tools || [],
          createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
          updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
          isVulnerableSample: Boolean(item.isVulnerableSample),
          warningLabel: item.warningLabel || undefined,
          promptVersion: typeof item.promptVersion === 'number' ? item.promptVersion : 1,
        };
      });
      onData(list);
    },
    (error) => {
      console.error('Firestore subscription error (targets):', error);
      onError(error);
    }
  );
};

export const fetchTargetById = async (
  userId: string,
  targetId: string
): Promise<AgentTarget | null> => {
  const targetDocRef = doc(db, 'users', userId, 'targets', targetId);
  const snap = await getDoc(targetDocRef);
  if (!snap.exists()) {
    return null;
  }
  const item = snap.data();
  return {
    id: snap.id,
    userId: item.userId || userId,
    name: item.name || 'Unnamed Agent',
    systemPrompt: item.systemPrompt || '',
    tools: item.tools || [],
    createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
    updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
    isVulnerableSample: Boolean(item.isVulnerableSample),
    warningLabel: item.warningLabel || undefined,
    promptVersion: typeof item.promptVersion === 'number' ? item.promptVersion : 1,
  };
};

export const updateAgentTarget = async (
  userId: string,
  targetId: string,
  data: {
    name: string;
    systemPrompt: string;
    tools: ToolDefinition[];
  }
): Promise<void> => {
  if (!auth.currentUser || auth.currentUser.uid !== userId) {
    throw new Error('Unauthorized: You can only edit your own targets.');
  }

  const now = Date.now();
  const sanitizedTools = data.tools.map((tool, idx) => {
    const norm = normalizeToolParameters(tool.parameters);
    return {
      id: tool.id || `tool-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
      name: (tool.name || '').trim(),
      description: (tool.description || '').trim(),
      parameters: norm ? JSON.stringify(norm, null, 2) : (tool.parameters || '{}').trim(),
    };
  });

  if (sanitizedTools.length === 0) {
    throw new Error('A target requires at least one configured tool.');
  }

  // Server-side verification
  try {
    const idToken = await auth.currentUser.getIdToken();
    if (idToken) {
      const resp = await fetch(`/api/targets/${encodeURIComponent(targetId)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          name: data.name.trim(),
          systemPrompt: data.systemPrompt.trim(),
          tools: sanitizedTools,
        }),
      });
      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.error || `Server verification failed (${resp.status})`);
      }
    }
  } catch (err: any) {
    console.warn('Server verification warning for update:', err?.message || err);
    // Continue with Firestore update as firestore.rules enforces owner check
  }

  const targetDocRef = doc(db, 'users', userId, 'targets', targetId);
  await updateDoc(targetDocRef, {
    name: data.name.trim(),
    systemPrompt: data.systemPrompt.trim(),
    tools: sanitizedTools,
    updatedAt: now,
    serverUpdatedAt: serverTimestamp(),
  });
};

export const deleteAgentTarget = async (
  userId: string,
  targetId: string
): Promise<void> => {
  if (!auth.currentUser || auth.currentUser.uid !== userId) {
    throw new Error('Unauthorized: You can only delete your own targets.');
  }

  // Delete subcollection 'messages' so nothing is orphaned
  try {
    const messagesCol = collection(db, 'users', userId, 'targets', targetId, 'messages');
    const messagesSnap = await getDocs(messagesCol);
    const deleteMessagePromises = messagesSnap.docs.map((docSnap) => deleteDoc(docSnap.ref));
    await Promise.all(deleteMessagePromises);
  } catch (subErr) {
    console.warn('Notice: Error clearing subcollection messages:', subErr);
  }

  // Delete subcollection 'runs' so nothing is orphaned
  try {
    const runsCol = collection(db, 'users', userId, 'targets', targetId, 'runs');
    const runsSnap = await getDocs(runsCol);
    const deleteRunPromises = runsSnap.docs.map((docSnap) => deleteDoc(docSnap.ref));
    await Promise.all(deleteRunPromises);
  } catch (subErr) {
    console.warn('Notice: Error clearing subcollection runs:', subErr);
  }

  // Server-side verification
  try {
    const idToken = await auth.currentUser.getIdToken();
    if (idToken) {
      await fetch(`/api/targets/${encodeURIComponent(targetId)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
    }
  } catch (srvErr) {
    console.warn('Server target delete warning:', srvErr);
  }

  // Delete the parent target document
  const targetDocRef = doc(db, 'users', userId, 'targets', targetId);
  await deleteDoc(targetDocRef);
};

// Message operations: users/{userId}/targets/{targetId}/messages/{messageId}
export const subscribeTargetMessages = (
  userId: string,
  targetId: string,
  onData: (messages: TargetChatMessage[]) => void,
  onError: (err: Error) => void
) => {
  const messagesCol = collection(db, 'users', userId, 'targets', targetId, 'messages');
  const q = query(messagesCol, orderBy('createdAt', 'asc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: TargetChatMessage[] = snapshot.docs.map((d) => {
        const item = d.data() as DocumentData;
        return {
          id: d.id,
          targetId,
          role: item.role as 'user' | 'assistant',
          content: item.content || '',
          createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
          modelUsed: item.modelUsed || undefined,
          primarySkipped: Boolean(item.primarySkipped),
          primaryError: item.primaryError || undefined,
          detailLevel: item.detailLevel || undefined,
        };
      });
      onData(list);
    },
    (error) => {
      console.error('Firestore subscription error (messages):', error);
      onError(error);
    }
  );
};

export const saveChatMessage = async (
  userId: string,
  targetId: string,
  message: {
    role: 'user' | 'assistant';
    content: string;
    modelUsed?: string;
    primarySkipped?: boolean;
    primaryError?: string | null;
    detailLevel?: 'brief' | 'full';
  }
): Promise<string> => {
  const messagesCol = collection(db, 'users', userId, 'targets', targetId, 'messages');
  const now = Date.now();
  const docRef = await addDoc(messagesCol, {
    targetId,
    role: message.role,
    content: message.content,
    modelUsed: message.modelUsed || null,
    primarySkipped: message.primarySkipped ?? false,
    primaryError: message.primaryError || null,
    detailLevel: message.detailLevel || null,
    createdAt: now,
    serverCreatedAt: serverTimestamp(),
  });
  return docRef.id;
};

// Detonation run operations: users/{userId}/targets/{targetId}/runs/{runId}
export const saveDetonationRun = async (
  userId: string,
  targetId: string,
  run: DetonationRun
): Promise<void> => {
  const runDocRef = doc(db, 'users', userId, 'targets', targetId, 'runs', run.id);
  await setDoc(runDocRef, {
    id: run.id,
    targetId: run.targetId,
    targetName: run.targetName,
    userId: run.userId,
    startedAt: run.startedAt,
    completedAt: run.completedAt || Date.now(),
    status: run.status,
    attacksAttempted: run.attacksAttempted,
    attacksPassed: run.attacksPassed,
    attacksBreached: run.attacksBreached,
    attacksNotApplicable: run.attacksNotApplicable || 0,
    attacksError: run.attacksError || 0,
    toolCallLog: run.toolCallLog || [],
    results: run.results || [],
    createdAt: run.startedAt,
    serverCreatedAt: serverTimestamp(),
    verificationForRunId: run.verificationForRunId || null,
    isVerificationRun: Boolean(run.isVerificationRun),
    promptVersionTested: run.promptVersionTested || 1,
  });
};

export const subscribeDetonationRuns = (
  userId: string,
  targetId: string,
  onData: (runs: DetonationRun[]) => void,
  onError: (error: Error) => void
) => {
  const runsCol = collection(db, 'users', userId, 'targets', targetId, 'runs');
  const q = query(runsCol, orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: DetonationRun[] = snapshot.docs.map((d) => {
        const item = d.data() as DocumentData;
        return {
          id: d.id,
          targetId: item.targetId || targetId,
          targetName: item.targetName || 'Agent Target',
          userId: item.userId || userId,
          startedAt: typeof item.startedAt === 'number' ? item.startedAt : Date.now(),
          completedAt: typeof item.completedAt === 'number' ? item.completedAt : undefined,
          status: item.status || 'completed',
          attacksAttempted: typeof item.attacksAttempted === 'number' ? item.attacksAttempted : 0,
          attacksPassed: typeof item.attacksPassed === 'number' ? item.attacksPassed : 0,
          attacksBreached: typeof item.attacksBreached === 'number' ? item.attacksBreached : 0,
          attacksNotApplicable: typeof item.attacksNotApplicable === 'number' ? item.attacksNotApplicable : 0,
          attacksError: typeof item.attacksError === 'number' ? item.attacksError : 0,
          toolCallLog: item.toolCallLog || [],
          results: item.results || [],
          verificationForRunId: item.verificationForRunId || undefined,
          isVerificationRun: Boolean(item.isVerificationRun),
          promptVersionTested: typeof item.promptVersionTested === 'number' ? item.promptVersionTested : 1,
        };
      });
      onData(list);
    },
    (error) => {
      console.error('Firestore subscription error (runs):', error);
      onError(error);
    }
  );
};

// Findings operations: users/{userId}/targets/{targetId}/findings/{findingId}
export const subscribeTargetFindings = (
  userId: string,
  targetId: string,
  onData: (findings: RemediationFinding[]) => void,
  onError: (error: Error) => void
) => {
  const findingsCol = collection(db, 'users', userId, 'targets', targetId, 'findings');
  const q = query(findingsCol, orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: RemediationFinding[] = snapshot.docs.map((d) => {
        const item = d.data() as DocumentData;
        return {
          id: d.id,
          targetId,
          runId: item.runId || '',
          rootCause: item.rootCause || 'Remediation Finding',
          description: item.description || '',
          breachedAttackIds: item.breachedAttackIds || [],
          breachedAttackNames: item.breachedAttackNames || [],
          promptPatch: item.promptPatch || { originalText: '', replacementText: '', explanation: '' },
          guardrailCode: item.guardrailCode || { language: 'python', code: '', explanation: '' },
          configChange: item.configChange || { title: '', recommendation: '', rationale: '' },
          status: item.status || 'pending',
          createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
          decidedAt: typeof item.decidedAt === 'number' ? item.decidedAt : undefined,
          appliedVersion: typeof item.appliedVersion === 'number' ? item.appliedVersion : undefined,
        };
      });
      onData(list);
    },
    (error) => {
      console.error('Firestore subscription error (findings):', error);
      onError(error);
    }
  );
};

// Versions operations: users/{userId}/targets/{targetId}/versions/{versionId}
export const subscribeTargetVersions = (
  userId: string,
  targetId: string,
  onData: (versions: TargetPromptVersion[]) => void,
  onError: (error: Error) => void
) => {
  const versionsCol = collection(db, 'users', userId, 'targets', targetId, 'versions');
  const q = query(versionsCol, orderBy('versionNumber', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: TargetPromptVersion[] = snapshot.docs.map((d) => {
        const item = d.data() as DocumentData;
        return {
          id: d.id,
          targetId,
          versionNumber: typeof item.versionNumber === 'number' ? item.versionNumber : 1,
          systemPrompt: item.systemPrompt || '',
          changeReason: item.changeReason || 'Prompt Version',
          findingId: item.findingId || undefined,
          appliedAt: typeof item.appliedAt === 'number' ? item.appliedAt : Date.now(),
          runId: item.runId || undefined,
          scoreBefore: typeof item.scoreBefore === 'number' ? item.scoreBefore : null,
          scoreAfter: typeof item.scoreAfter === 'number' ? item.scoreAfter : null,
        };
      });
      onData(list);
    },
    (error) => {
      console.error('Firestore subscription error (versions):', error);
      onError(error);
    }
  );
};


