import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import {
  buildAdversarialAuditorPrompt,
  generateContentWithFallback,
} from './server/gemini.ts';
import { selectAttacksForTarget, ATTACK_LIBRARY } from './server/attackLibrary.ts';
import { runDetonation } from './server/detonationEngine.ts';
import { normalizeToolParameters } from './server/decoyEngine.ts';
import { generateFixesForRun } from './server/fixerEngine.ts';
import type { AgentTarget, RemediationFinding } from './src/types';

const PORT = 3000;
const HOST = '0.0.0.0';

// Read project configuration from firebase-applet-config.json
const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
let firebaseConfig = {
  projectId: 'wire-trap-26',
  firestoreDatabaseId: 'ai-studio-6b89a318-861b-468f-ac17-f4c9108e12fb',
};

try {
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed.projectId) firebaseConfig.projectId = parsed.projectId;
    if (parsed.firestoreDatabaseId) firebaseConfig.firestoreDatabaseId = parsed.firestoreDatabaseId;
  }
} catch (e) {
  console.warn('[Server Startup] Warning loading firebase-applet-config.json:', e);
}

// Ensure Firebase Admin SDK is initialized with the correct project ID before any route uses it
const adminApp =
  getApps().length === 0
    ? initializeApp({ projectId: firebaseConfig.projectId })
    : getApps()[0];

const adminAuth = getAuth(adminApp);
const adminFirestore = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);

console.log(
  `[Firebase Admin] Initialized with projectId="${firebaseConfig.projectId}", databaseId="${firebaseConfig.firestoreDatabaseId}"`
);

interface VerifiedAuth {
  uid: string;
  token: string;
}

// Helper for server-side Bearer token authentication and owner verification
async function verifyBearerToken(authHeader: string | undefined): Promise<VerifiedAuth> {
  if (!authHeader) {
    console.error('[Auth Error]: Missing Authorization header');
    throw new Error('Missing Authorization header');
  }

  const prefix = 'Bearer ';
  if (!authHeader.startsWith(prefix)) {
    console.error('[Auth Error]: Authorization header does not start with Bearer');
    throw new Error('Missing or malformed Authorization header');
  }

  const token = authHeader.slice(prefix.length).trim();
  if (!token) {
    console.error('[Auth Error]: Empty Bearer token');
    throw new Error('Empty Bearer token');
  }

  try {
    // Verify token using Firebase Admin SDK
    const decodedToken = await adminAuth.verifyIdToken(token);

    // Verify token audience matches project ID
    if (decodedToken.aud !== firebaseConfig.projectId) {
      console.error(
        `[Auth Error]: Token audience mismatch. Expected: "${firebaseConfig.projectId}", Received: "${decodedToken.aud}"`
      );
      throw new Error(`Token audience mismatch: expected ${firebaseConfig.projectId}`);
    }

    // Verify token issuer matches project ID (https://securetoken.google.com/<projectId>)
    const expectedIssuer = `https://securetoken.google.com/${firebaseConfig.projectId}`;
    if (decodedToken.iss !== expectedIssuer) {
      console.error(
        `[Auth Error]: Token issuer mismatch. Expected: "${expectedIssuer}", Received: "${decodedToken.iss}"`
      );
      throw new Error(`Token issuer mismatch: expected ${expectedIssuer}`);
    }

    const uid = decodedToken.uid || decodedToken.sub;
    if (!uid) {
      console.error('[Auth Error]: Decoded token has no valid uid or sub claim');
      throw new Error('Authentication token does not contain a valid user identity');
    }

    return { uid, token };
  } catch (err: any) {
    // Errors from verifyIdToken are logged server-side with the actual reason, not swallowed into a generic message
    console.error(
      `[Auth Error]: verifyIdToken failed: code="${err?.code || 'UNKNOWN'}", message="${err?.message || err}"`
    );
    throw err;
  }
}

function parseFirestoreValue(val: any): any {
  if (!val || typeof val !== 'object') return null;
  if ('stringValue' in val) return val.stringValue;
  if ('integerValue' in val) return parseInt(val.integerValue, 10);
  if ('doubleValue' in val) return parseFloat(val.doubleValue);
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('nullValue' in val) return null;
  if ('arrayValue' in val) return (val.arrayValue?.values || []).map(parseFirestoreValue);
  if ('mapValue' in val) {
    const res: Record<string, any> = {};
    for (const [k, v] of Object.entries(val.mapValue?.fields || {})) {
      res[k] = parseFirestoreValue(v);
    }
    return res;
  }
  return null;
}

/**
 * Strictly fetch the target from Firestore at users/{uid}/targets/{targetId}
 * NEVER read a path built from a client-supplied userId.
 * Returns null if not found (404).
 */
async function getTargetForUser(
  uid: string,
  targetId: string,
  idToken: string
): Promise<AgentTarget | null> {
  const targetPath = `users/${uid}/targets/${targetId}`;

  // 1. First attempt: Firebase Admin SDK
  try {
    const docRef = adminFirestore.doc(targetPath);
    const snap = await docRef.get();
    if (snap.exists) {
      const data = snap.data() || {};
      return {
        id: snap.id,
        userId: uid,
        name: data.name || 'Target Agent',
        systemPrompt: data.systemPrompt || '',
        tools: Array.isArray(data.tools) ? data.tools : [],
        createdAt: data.createdAt || Date.now(),
        updatedAt: data.updatedAt || Date.now(),
        promptVersion: typeof data.promptVersion === 'number' ? data.promptVersion : 1,
      };
    }
    return null;
  } catch (adminErr: any) {
    console.warn(
      `[Firestore Admin SDK notice for ${targetPath}]: ${adminErr?.message || adminErr}. Checking via REST API.`
    );
  }

  // 2. Fallback: Firestore REST API using the verified Bearer token
  try {
    const dbName = firebaseConfig.firestoreDatabaseId || '(default)';
    const encodedUid = encodeURIComponent(uid);
    const encodedTargetId = encodeURIComponent(targetId);
    const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${dbName}/documents/users/${encodedUid}/targets/${encodedTargetId}`;

    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });

    if (resp.status === 404) {
      return null;
    }

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[Firestore REST API error for ${targetPath}]: status=${resp.status}, body=${errText}`);
      return null;
    }

    const docJson = (await resp.json()) as any;
    if (!docJson || !docJson.fields) {
      return null;
    }

    const parsedFields: Record<string, any> = {};
    for (const [key, val] of Object.entries(docJson.fields)) {
      parsedFields[key] = parseFirestoreValue(val);
    }

    return {
      id: targetId,
      userId: uid,
      name: parsedFields.name || 'Target Agent',
      systemPrompt: parsedFields.systemPrompt || '',
      tools: Array.isArray(parsedFields.tools) ? parsedFields.tools : [],
      createdAt: parsedFields.createdAt || Date.now(),
      updatedAt: parsedFields.updatedAt || Date.now(),
      promptVersion: typeof parsedFields.promptVersion === 'number' ? parsedFields.promptVersion : 1,
    };
  } catch (restErr: any) {
    console.error(`[Firestore REST API failed for ${targetPath}]:`, restErr?.message || restErr);
    return null;
  }
}

async function startServer() {
  const app = express();

  // Server Robustness: Mount body parsers FIRST before defining routes
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'wiretrap-core',
      timestamp: new Date().toISOString(),
    });
  });

  // Server-side Target Update Verification & Processing Endpoint
  app.put('/api/targets/:targetId', async (req, res) => {
    try {
      const { uid } = await verifyBearerToken(req.headers.authorization);
      const targetId = req.params.targetId;
      if (!targetId) {
        return res.status(400).json({ error: 'Target ID is required' });
      }

      const body = req.body || {};
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const systemPrompt = typeof body.systemPrompt === 'string' ? body.systemPrompt.trim() : '';
      const tools = Array.isArray(body.tools) ? body.tools : [];

      // Defensive schema bounds
      if (!name || name.length > 100) {
        return res.status(400).json({ error: 'Agent Name must be between 1 and 100 characters' });
      }
      if (!systemPrompt || systemPrompt.length > 32768) {
        return res.status(400).json({ error: 'System Prompt must be between 1 and 32,768 characters' });
      }
      if (tools.length === 0) {
        return res.status(400).json({ error: 'At least one tool definition is required' });
      }
      if (tools.length > 20) {
        return res.status(400).json({ error: 'Maximum 20 tools allowed per agent target' });
      }

      // Validate JSON schemas for each tool (accepts full JSON Schema or shorthand)
      for (let i = 0; i < tools.length; i++) {
        const tool = tools[i];
        if (!tool.name || typeof tool.name !== 'string' || !tool.name.trim()) {
          return res.status(400).json({ error: `Tool #${i + 1} is missing a tool name` });
        }
        if (tool.parameters && tool.parameters.trim()) {
          const norm = normalizeToolParameters(tool.parameters);
          if (!norm) {
            return res.status(400).json({
              error: `Tool "${tool.name}" contains invalid parameters: must be valid JSON Schema or shorthand object`,
            });
          }
        }
      }

      return res.json({
        success: true,
        targetId,
        uid,
        updatedAt: Date.now(),
      });
    } catch (err: any) {
      console.error('[API PUT /api/targets/:targetId Error]:', err?.message || err);
      const status =
        err.message?.includes('token') ||
        err.message?.includes('Authorization') ||
        err?.code?.startsWith('auth/')
          ? 401
          : 500;
      return res.status(status).json({
        error: err.message || 'Failed to verify target update',
      });
    }
  });

  // Server-side Target Delete Verification Endpoint
  app.delete('/api/targets/:targetId', async (req, res) => {
    try {
      const { uid } = await verifyBearerToken(req.headers.authorization);
      const targetId = req.params.targetId;
      if (!targetId) {
        return res.status(400).json({ error: 'Target ID is required' });
      }

      return res.json({
        success: true,
        deletedTargetId: targetId,
        uid,
      });
    } catch (err: any) {
      console.error('[API DELETE /api/targets/:targetId Error]:', err?.message || err);
      const status =
        err.message?.includes('token') ||
        err.message?.includes('Authorization') ||
        err?.code?.startsWith('auth/')
          ? 401
          : 500;
      return res.status(status).json({
        error: err.message || 'Failed to verify target deletion',
      });
    }
  });

  // Helper: Strip undefined values before any Firestore write (Production Directive 8)
  function stripUndefined<T>(obj: T): T {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
      return obj.map(stripUndefined) as unknown as T;
    }
    const clean: Record<string, any> = {};
    for (const [key, val] of Object.entries(obj as Record<string, any>)) {
      if (val !== undefined) {
        clean[key] = stripUndefined(val);
      }
    }
    return clean as T;
  }

  // ==========================================
  // REMEDIATION & FIX GENERATION ENDPOINTS
  // ==========================================

  // Generate fixes for breached attacks in a run (quota-disciplined: at most 3 findings per call)
  app.post('/api/targets/:targetId/fixes/generate', async (req, res) => {
    try {
      const { uid, token } = await verifyBearerToken(req.headers.authorization);
      const targetId = req.params.targetId;
      const body = req.body || {};
      const runId = typeof body.runId === 'string' ? body.runId.trim() : '';

      if (!targetId || !runId) {
        return res.status(400).json({ error: 'targetId and runId are required' });
      }

      const target = await getTargetForUser(uid, targetId, token);
      if (!target) {
        return res.status(404).json({ error: 'Target not found' });
      }

      // Fetch run document from users/{uid}/targets/{targetId}/runs/{runId}
      let runResults: any[] = [];
      try {
        const runRef = adminFirestore.doc(`users/${uid}/targets/${targetId}/runs/${runId}`);
        const runSnap = await runRef.get();
        if (runSnap.exists) {
          runResults = runSnap.data()?.results || [];
        }
      } catch (runErr: any) {
        console.warn(`[Fixes Generate] Could not read run via Admin SDK: ${runErr.message}`);
      }

      // If client also supplied results as fallback payload
      if (runResults.length === 0 && Array.isArray(body.results)) {
        runResults = body.results;
      }

      const breachedResults = runResults.filter((r) => r.status === 'BREACHED');
      if (breachedResults.length === 0) {
        return res.json({ findings: [], message: 'No breached attacks to remediate' });
      }

      // Query existing findings for this run to avoid duplicate root causes and enable pagination
      const existingRootCauses: string[] = [];
      try {
        const findingsCol = adminFirestore.collection(`users/${uid}/targets/${targetId}/findings`);
        const existingSnap = await findingsCol.where('runId', '==', runId).get();
        existingSnap.forEach((doc) => {
          const d = doc.data();
          if (d.rootCause) existingRootCauses.push(d.rootCause);
        });
      } catch (snapErr: any) {
        console.warn(`[Fixes Generate] Querying existing findings notice: ${snapErr.message}`);
      }

      // Generate at most 3 findings per request (quota discipline)
      const findings = await generateFixesForRun(target, breachedResults, {
        runId,
        maxFindings: 3,
        existingRootCauses,
      });

      // Persist findings to Firestore under users/{uid}/targets/{targetId}/findings/{findingId}
      for (const finding of findings) {
        try {
          const findingRef = adminFirestore.doc(
            `users/${uid}/targets/${targetId}/findings/${finding.id}`
          );
          await findingRef.set(stripUndefined(finding));
        } catch (saveErr: any) {
          console.error(`[Fixes Generate] Failed to save finding ${finding.id}:`, saveErr.message);
        }
      }

      return res.json({
        findings,
        totalBreachedAttacks: breachedResults.length,
        alreadyRemediatedCount: existingRootCauses.length + findings.length,
        hasMoreToGenerate: breachedResults.length > (existingRootCauses.length + findings.length),
      });
    } catch (err: any) {
      console.error('[API POST /api/targets/:targetId/fixes/generate Error]:', err?.message || err);
      const status =
        err.message?.includes('token') ||
        err.message?.includes('Authorization') ||
        err?.code?.startsWith('auth/')
          ? 401
          : 500;
      return res.status(status).json({
        error: err.message || 'Failed to generate remediations',
      });
    }
  });

  // Approve and Apply a prompt patch (Strictly server-side and owner-bound; bumps version number)
  app.post('/api/targets/:targetId/fixes/apply', async (req, res) => {
    try {
      const { uid, token } = await verifyBearerToken(req.headers.authorization);
      const targetId = req.params.targetId;
      const body = req.body || {};
      const { findingId, originalText, replacementText, explanation, runId } = body;

      if (!targetId || !findingId || !replacementText) {
        return res.status(400).json({ error: 'targetId, findingId, and replacementText are required' });
      }

      const target = await getTargetForUser(uid, targetId, token);
      if (!target) {
        return res.status(404).json({ error: 'Target not found' });
      }

      const currentVersion = typeof target.promptVersion === 'number' ? target.promptVersion : 1;
      const newVersion = currentVersion + 1;

      // Calculate new system prompt
      let newPrompt = target.systemPrompt || '';
      const trimmedOriginal = typeof originalText === 'string' ? originalText.trim() : '';
      const trimmedReplacement = typeof replacementText === 'string' ? replacementText.trim() : '';

      if (trimmedOriginal && newPrompt.includes(trimmedOriginal)) {
        newPrompt = newPrompt.replace(trimmedOriginal, trimmedReplacement);
      } else {
        // Append cleanly as a dedicated security directive block
        newPrompt = `${newPrompt.trim()}\n\n# Security Hardening Directive (v${newVersion}):\n${trimmedReplacement}`;
      }

      const now = Date.now();

      // 1. Ensure baseline version record exists for currentVersion
      try {
        const baseVersionRef = adminFirestore.doc(
          `users/${uid}/targets/${targetId}/versions/v${currentVersion}`
        );
        const baseSnap = await baseVersionRef.get();
        if (!baseSnap.exists) {
          await baseVersionRef.set(
            stripUndefined({
              id: `v${currentVersion}`,
              targetId,
              versionNumber: currentVersion,
              systemPrompt: target.systemPrompt,
              changeReason: 'Initial Target Prompt Baseline',
              appliedAt: target.createdAt || now - 60000,
            })
          );
        }
      } catch (baseErr: any) {
        console.warn(`[Patch Apply] Base version snapshot notice: ${baseErr.message}`);
      }

      // 2. Write new prompt version record into users/{uid}/targets/{targetId}/versions/v${newVersion}
      const newVersionRef = adminFirestore.doc(
        `users/${uid}/targets/${targetId}/versions/v${newVersion}`
      );
      await newVersionRef.set(
        stripUndefined({
          id: `v${newVersion}`,
          targetId,
          versionNumber: newVersion,
          systemPrompt: newPrompt,
          changeReason: explanation || 'Approved Remediation Prompt Patch',
          findingId,
          runId: runId || null,
          appliedAt: now,
        })
      );

      // 3. Update target document in Firestore with new systemPrompt and bumped promptVersion
      const targetRef = adminFirestore.doc(`users/${uid}/targets/${targetId}`);
      await targetRef.update(
        stripUndefined({
          systemPrompt: newPrompt,
          promptVersion: newVersion,
          updatedAt: now,
        })
      );

      // 4. Update the finding status to approved
      try {
        const findingRef = adminFirestore.doc(
          `users/${uid}/targets/${targetId}/findings/${findingId}`
        );
        await findingRef.update(
          stripUndefined({
            status: 'approved',
            decidedAt: now,
            appliedVersion: newVersion,
          })
        );
      } catch (findErr: any) {
        console.warn(`[Patch Apply] Finding update notice: ${findErr.message}`);
      }

      console.log(
        `[Prompt Patch Applied] Target ${targetId} upgraded to v${newVersion} by user ${uid} (Finding: ${findingId})`
      );

      return res.json({
        success: true,
        newVersion,
        systemPrompt: newPrompt,
        findingId,
      });
    } catch (err: any) {
      console.error('[API POST /api/targets/:targetId/fixes/apply Error]:', err?.message || err);
      const status =
        err.message?.includes('token') ||
        err.message?.includes('Authorization') ||
        err?.code?.startsWith('auth/')
          ? 401
          : 500;
      return res.status(status).json({
        error: err.message || 'Failed to apply prompt patch',
      });
    }
  });

  // Reject a prompt patch (Updates finding status to rejected)
  app.post('/api/targets/:targetId/fixes/reject', async (req, res) => {
    try {
      const { uid } = await verifyBearerToken(req.headers.authorization);
      const targetId = req.params.targetId;
      const body = req.body || {};
      const { findingId } = body;

      if (!targetId || !findingId) {
        return res.status(400).json({ error: 'targetId and findingId are required' });
      }

      const now = Date.now();
      const findingRef = adminFirestore.doc(
        `users/${uid}/targets/${targetId}/findings/${findingId}`
      );
      await findingRef.update(
        stripUndefined({
          status: 'rejected',
          decidedAt: now,
        })
      );

      return res.json({ success: true, findingId, status: 'rejected' });
    } catch (err: any) {
      console.error('[API POST /api/targets/:targetId/fixes/reject Error]:', err?.message || err);
      const status =
        err.message?.includes('token') ||
        err.message?.includes('Authorization') ||
        err?.code?.startsWith('auth/')
          ? 401
          : 500;
      return res.status(status).json({
        error: err.message || 'Failed to reject remediation patch',
      });
    }
  });

  // Roll back to a previous prompt version
  app.post('/api/targets/:targetId/versions/rollback', async (req, res) => {
    try {
      const { uid, token } = await verifyBearerToken(req.headers.authorization);
      const targetId = req.params.targetId;
      const body = req.body || {};
      const targetVersionNumber = Number(body.targetVersionNumber);

      if (!targetId || !targetVersionNumber || isNaN(targetVersionNumber)) {
        return res.status(400).json({ error: 'targetId and a valid targetVersionNumber are required' });
      }

      const target = await getTargetForUser(uid, targetId, token);
      if (!target) {
        return res.status(404).json({ error: 'Target not found' });
      }

      // Fetch the historical version record
      const histVersionRef = adminFirestore.doc(
        `users/${uid}/targets/${targetId}/versions/v${targetVersionNumber}`
      );
      const histSnap = await histVersionRef.get();
      if (!histSnap.exists) {
        return res.status(404).json({ error: `Version v${targetVersionNumber} not found in history` });
      }

      const histData = histSnap.data() || {};
      const restoredPrompt = histData.systemPrompt || '';

      const currentVersion = typeof target.promptVersion === 'number' ? target.promptVersion : 1;
      const newVersion = currentVersion + 1;
      const now = Date.now();

      // Create new audit version entry for this rollback
      const newVersionRef = adminFirestore.doc(
        `users/${uid}/targets/${targetId}/versions/v${newVersion}`
      );
      await newVersionRef.set(
        stripUndefined({
          id: `v${newVersion}`,
          targetId,
          versionNumber: newVersion,
          systemPrompt: restoredPrompt,
          changeReason: `Rollback to v${targetVersionNumber} (was at v${currentVersion})`,
          appliedAt: now,
        })
      );

      // Update target
      const targetRef = adminFirestore.doc(`users/${uid}/targets/${targetId}`);
      await targetRef.update(
        stripUndefined({
          systemPrompt: restoredPrompt,
          promptVersion: newVersion,
          updatedAt: now,
        })
      );

      console.log(
        `[Prompt Rollback] Target ${targetId} rolled back to content of v${targetVersionNumber} as v${newVersion}`
      );

      return res.json({
        success: true,
        newVersion,
        systemPrompt: restoredPrompt,
        rolledBackToVersion: targetVersionNumber,
      });
    } catch (err: any) {
      console.error('[API POST /api/targets/:targetId/versions/rollback Error]:', err?.message || err);
      const status =
        err.message?.includes('token') ||
        err.message?.includes('Authorization') ||
        err?.code?.startsWith('auth/')
          ? 401
          : 500;
      return res.status(status).json({
        error: err.message || 'Failed to rollback version',
      });
    }
  });

  // Live Firestore security rules endpoint (read-only for security audit inspection)
  app.get('/api/security/rules', (_req, res) => {
    try {
      const rulesPath = path.join(process.cwd(), 'firestore.rules');
      if (fs.existsSync(rulesPath)) {
        const rulesContent = fs.readFileSync(rulesPath, 'utf-8');
        return res.json({ rules: rulesContent });
      }
      return res.status(404).json({ error: 'firestore.rules not found' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to read firestore.rules' });
    }
  });

  // Security Chat Analysis Endpoint (Authenticated, verifies ownership and fetches target from Firestore)
  app.post('/api/chat', async (req, res) => {
    try {
      const { uid, token } = await verifyBearerToken(req.headers.authorization);

      // Never destructure req.body blind. Guard with a fallback default.
      const body = req.body || {};
      const targetId = typeof body.targetId === 'string' ? body.targetId.trim() : '';

      if (!targetId) {
        return res.status(400).json({ error: 'targetId is required' });
      }

      // Fetch the target from Firestore at users/{uid}/targets/{targetId}
      // Never read a path built from a client-supplied userId.
      const target = await getTargetForUser(uid, targetId, token);
      if (!target) {
        console.warn(`[API /api/chat]: Target ${targetId} not found for uid ${uid}`);
        return res.status(404).json({ error: 'Target not found' });
      }

      const history = Array.isArray(body.history) ? body.history : [];
      const userMessage = typeof body.userMessage === 'string' ? body.userMessage.trim() : '';
      const detailLevel: 'brief' | 'full' = body.detailLevel === 'full' ? 'full' : 'brief';

      if (!userMessage) {
        return res.status(400).json({ error: 'userMessage is required' });
      }

      // Safeguard against abusive payload lengths
      if (userMessage.length > 8000) {
        return res.status(400).json({ error: 'userMessage exceeds max length (8000 chars)' });
      }

      // Use the verified target from Firestore, never client-supplied prompts
      const { systemInstruction, contents } = buildAdversarialAuditorPrompt({
        targetId: target.id,
        targetName: target.name,
        systemPrompt: target.systemPrompt,
        tools: target.tools,
        history,
        userMessage,
        detailLevel,
      });

      const { text, modelUsed, primarySkipped, primaryError, skippedModels } =
        await generateContentWithFallback({
          contents,
          systemInstruction,
        });

      return res.json({
        reply: text,
        modelUsed,
        primarySkipped,
        primaryError: primaryError || null,
        skippedModels,
      });
    } catch (error: any) {
      console.error('[API /api/chat Error]:', error?.message || error);
      const status =
        error.message?.includes('token') ||
        error.message?.includes('Authorization') ||
        error?.code?.startsWith('auth/')
          ? 401
          : 500;
      return res.status(status).json({
        error: error.message || 'Internal error processing adversarial analysis request',
      });
    }
  });

// In-memory rate limiting map for /api/run: max 3 runs per hour, tracked server-side per uid
const userRunTimestamps = new Map<string, number[]>();

function checkUserRunRateLimit(uid: string): { allowed: boolean; retryAfterMinutes?: number } {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;

  // Keep only timestamps within the last 60 minutes
  const timestamps = (userRunTimestamps.get(uid) || []).filter((t) => t > oneHourAgo);
  userRunTimestamps.set(uid, timestamps);

  if (timestamps.length >= 3) {
    const oldest = timestamps[0];
    const waitMs = oldest + 60 * 60 * 1000 - now;
    const retryAfterMinutes = Math.max(1, Math.ceil(waitMs / 60000));
    return { allowed: false, retryAfterMinutes };
  }

  timestamps.push(now);
  userRunTimestamps.set(uid, timestamps);
  return { allowed: true };
}

  // Adversarial Detonation Run Endpoint (Decoy sandbox tool simulation)
  app.post('/api/run', async (req, res) => {
    let verifiedUid = '';
    let targetId = '';
    try {
      // 1. Verify the ID token and extract uid from it
      const { uid, token } = await verifyBearerToken(req.headers.authorization);
      verifiedUid = uid;

      const body = req.body || {};
      const verificationForRunId = typeof body.verificationForRunId === 'string' ? body.verificationForRunId.trim() : '';
      const isVerification = Boolean(verificationForRunId);

      // Rate limit check: max 3 runs per hour, tracked server-side per uid (verification runs exempt to encourage security testing)
      if (!isVerification) {
        const rateLimit = checkUserRunRateLimit(uid);
        if (!rateLimit.allowed) {
          console.warn(`[API /api/run Rate Limit]: User ${uid} exceeded 3 runs/hour limit.`);
          return res.status(429).json({
            error: `Rate limit reached: Maximum 3 detonation runs per hour allowed. Please try again in ${rateLimit.retryAfterMinutes} minute(s).`,
          });
        }
      }

      // Accept ONLY { targetId }
      targetId =
        typeof body.targetId === 'string' && body.targetId.trim()
          ? body.targetId.trim()
          : (body.target?.id ? String(body.target.id).trim() : '');

      if (!targetId) {
        return res.status(400).json({ error: 'targetId is required' });
      }

      const cheapMode = body.cheapMode === true || req.query.cheapMode === 'true';

      // 2. Fetch the target from Firestore at users/{uid}/targets/{targetId}
      // Never read a path built from a client-supplied userId
      const target = await getTargetForUser(uid, targetId, token);
      if (!target) {
        console.warn(`[API /api/run]: Target ${targetId} not found under users/${uid}/targets/${targetId}`);
        return res.status(404).json({ error: 'Target not found' });
      }

      if (!target.systemPrompt) {
        return res.status(400).json({ error: 'Agent target does not have a configured systemPrompt' });
      }

      console.log(
        `[API /api/run] Loaded target "${target.name}" (${target.id}) with ${target.tools.length} declared tool(s): [${target.tools.map((t) => t.name).join(', ')}] (cheapMode: ${cheapMode}, isVerification: ${isVerification})`
      );

      // Determine attacks to run:
      // If specific attackIds are provided (e.g. for verification re-test), filter the exact attacks from ATTACK_LIBRARY
      let attacksToExecute = null;
      if (Array.isArray(body.attackIds) && body.attackIds.length > 0) {
        const matched = ATTACK_LIBRARY.filter((a) => body.attackIds.includes(a.id));
        if (matched.length > 0) {
          attacksToExecute = matched;
        }
      }
      if (!attacksToExecute) {
        attacksToExecute = await selectAttacksForTarget(target, { cheapMode });
      }

      // Check if client requested streaming SSE
      const isStream =
        req.headers.accept?.includes('text/event-stream') ||
        req.query.stream === 'true' ||
        body.stream === true;

      if (isStream) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });

        res.write(
          `data: ${JSON.stringify({
            type: 'init',
            totalAttacks: attacksToExecute.length,
            attacks: attacksToExecute,
          })}\n\n`
        );
        if (typeof (res as any).flush === 'function') {
          (res as any).flush();
        }

        const runResult = await runDetonation(target, {
          cheapMode,
          selectedAttacks: attacksToExecute,
          concurrency: 4,
          onProgress: (event) => {
            console.log(
              `[SSE Server Emit] event=${event.type}, attackId=${event.attackId}, status=${event.result ? event.result.status : 'started'}`
            );
            res.write(`data: ${JSON.stringify(event)}\n\n`);
            if (typeof (res as any).flush === 'function') {
              (res as any).flush();
            }
          },
        });

        if (isVerification) {
          runResult.verificationForRunId = verificationForRunId;
          runResult.isVerificationRun = true;
        }
        const effectivePromptVersion =
          typeof body.promptVersion === 'number' && body.promptVersion > 0
            ? body.promptVersion
            : typeof target.promptVersion === 'number' && target.promptVersion > 0
            ? target.promptVersion
            : 1;
        runResult.promptVersionTested = effectivePromptVersion;

        const errorCount = runResult.results.filter((r) => r.status === 'ERROR').length;
        console.log(
          `[DETONATION RUN COMPLETE] uid=${verifiedUid}, targetId=${targetId}, attackCount=${runResult.attacksAttempted}, outcome=${runResult.status} (passed=${runResult.attacksPassed}, breached=${runResult.attacksBreached}, errors=${errorCount}, cheapMode=${cheapMode}, isVerification=${isVerification}, promptVersionTested=${effectivePromptVersion})`
        );

        res.write(
          `data: ${JSON.stringify({
            type: 'run_complete',
            run: runResult,
          })}\n\n`
        );
        if (typeof (res as any).flush === 'function') {
          (res as any).flush();
        }
        res.end();
      } else {
        const runResult = await runDetonation(target, {
          cheapMode,
          selectedAttacks: attacksToExecute,
          concurrency: 4,
        });

        if (isVerification) {
          runResult.verificationForRunId = verificationForRunId;
          runResult.isVerificationRun = true;
        }
        const effectivePromptVersion =
          typeof body.promptVersion === 'number' && body.promptVersion > 0
            ? body.promptVersion
            : typeof target.promptVersion === 'number' && target.promptVersion > 0
            ? target.promptVersion
            : 1;
        runResult.promptVersionTested = effectivePromptVersion;

        const errorCount = runResult.results.filter((r) => r.status === 'ERROR').length;
        console.log(
          `[DETONATION RUN COMPLETE] uid=${verifiedUid}, targetId=${targetId}, attackCount=${runResult.attacksAttempted}, outcome=${runResult.status} (passed=${runResult.attacksPassed}, breached=${runResult.attacksBreached}, errors=${errorCount}, cheapMode=${cheapMode}, isVerification=${isVerification}, promptVersionTested=${effectivePromptVersion})`
        );

        return res.json(runResult);
      }
    } catch (err: any) {
      console.error('[API /api/run Error]:', err?.message || err);
      if (verifiedUid && targetId) {
        console.log(
          `[DETONATION RUN FAILED] uid=${verifiedUid}, targetId=${targetId}, error=${err?.message || err}`
        );
      }

      const errMsg = err?.message || String(err);
      const isQuota =
        errMsg.toLowerCase().includes('quota') ||
        errMsg.toLowerCase().includes('429') ||
        errMsg.toLowerCase().includes('resource_exhausted');

      const userDisplayError = isQuota
        ? 'Gemini quota exhausted — try again later'
        : errMsg || 'Failed to execute detonation run';

      const status =
        isQuota
          ? 429
          : err.message?.includes('token') ||
            err.message?.includes('Authorization') ||
            err?.code?.startsWith('auth/')
            ? 401
            : err.message?.includes('Access denied')
              ? 403
              : 500;

      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: userDisplayError })}\n\n`);
        return res.end();
      }
      return res.status(status).json({
        error: userDisplayError,
      });
    }
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, host: HOST, port: PORT },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`[Wiretrap] Server running on http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
