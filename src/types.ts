export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  parameters: string; // JSON schema string
}

export interface AgentTarget {
  id: string;
  userId: string;
  name: string;
  systemPrompt: string;
  tools: ToolDefinition[];
  createdAt: number;
  updatedAt: number;
  isVulnerableSample?: boolean;
  warningLabel?: string;
  promptVersion?: number;
}

export interface TargetChatMessage {
  id: string;
  targetId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  modelUsed?: string;
  primarySkipped?: boolean;
  primaryError?: string;
  detailLevel?: 'brief' | 'full';
}

export type AttackCategory =
  | 'DIRECT_OVERRIDE'
  | 'INDIRECT_INJECTION'
  | 'TOOL_HIJACK'
  | 'WORKFLOW_ABUSE'
  | 'STATE_ASSERTION'
  | 'INCREMENTAL_ESCALATION'
  | 'SCOPE_CREEP'
  | 'EXFILTRATION'
  | 'ARGUMENT_TAMPERING'
  | 'APPROVAL_BYPASS';

export type AttackSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM';

export type CapabilityClass = 'READ' | 'WRITE' | 'SEND' | 'EXECUTE' | 'SEARCH';

export interface AttackDefinition {
  id: string;
  name: string;
  category: AttackCategory;
  severity: AttackSeverity;
  prompt: string;
  prompts?: string[];
  targetsToolPatterns: string[];
  requiredCapabilities?: CapabilityClass[];
  description: string;
  requiredAction?: string;
  allowedTools?: string[];
  legitimateTurns?: number[];
  legitimateArgs?: Record<string, any>;
  unauthorizedArgPatterns?: Record<string, string>;
}

export interface DecoyToolCall {
  toolName: string;
  arguments: Record<string, any>;
  turnIndex: number;
  attackId: string;
  timestamp: number;
  fakeOutputReturned?: any;
  argumentDiff?: string;
}

export interface AttackExecutionResult {
  attackId: string;
  attackName: string;
  category: AttackCategory;
  severity: AttackSeverity;
  prompt: string;
  prompts?: string[];
  description?: string;
  status: 'pending' | 'running' | 'PASSED' | 'BREACHED' | 'ERROR' | 'NOT_APPLICABLE';
  toolsFired: DecoyToolCall[];
  agentFinalResponse?: string;
  turns: number;
  startedAt: number;
  completedAt?: number;
  error?: string;
  notApplicableReason?: string;
  argumentDiff?: string;
  verdictReason?: string;
  saidNoDidYes?: boolean;
}

export interface DetonationRun {
  id: string;
  targetId: string;
  targetName: string;
  userId: string;
  startedAt: number;
  completedAt?: number;
  status: 'running' | 'completed' | 'failed';
  attacksAttempted: number;
  attacksPassed: number;
  attacksBreached: number;
  attacksNotApplicable?: number;
  attacksError?: number;
  cheapMode?: boolean;
  toolCallLog: DecoyToolCall[];
  results: AttackExecutionResult[];
  error?: string;
  verificationForRunId?: string;
  isVerificationRun?: boolean;
  promptVersionTested?: number;
}

export interface PromptPatch {
  originalText: string;
  replacementText: string;
  explanation: string;
}

export interface GuardrailCode {
  language: string; // 'python' | 'typescript' | 'json'
  targetToolName?: string;
  code: string;
  explanation: string;
}

export interface ConfigChange {
  title: string;
  recommendation: string;
  rationale: string;
}

export interface RemediationFinding {
  id: string;
  targetId: string;
  runId: string;
  rootCause: string;
  description: string;
  breachedAttackIds: string[];
  breachedAttackNames: string[];
  promptPatch: PromptPatch;
  guardrailCode: GuardrailCode;
  configChange: ConfigChange;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
  decidedAt?: number;
  appliedVersion?: number;
}

export interface TargetPromptVersion {
  id: string;
  targetId: string;
  versionNumber: number;
  systemPrompt: string;
  changeReason: string;
  findingId?: string;
  appliedAt: number;
  runId?: string;
  scoreBefore?: number | null;
  scoreAfter?: number | null;
}

export interface AttackTransition {
  attackId: string;
  attackName: string;
  category: AttackCategory;
  severity: AttackSeverity;
  beforeStatus: AttackExecutionResult['status'];
  afterStatus: AttackExecutionResult['status'];
  transition: 'RESOLVED' | 'STILL_BREACHED' | 'REGRESSED' | 'UNCHANGED';
  explanation?: string;
}

export interface AnalyzeChatRequest {
  targetId: string;
  targetName: string;
  systemPrompt: string;
  tools: ToolDefinition[];
  history: Array<{ role: 'user' | 'model'; parts: string }>;
  userMessage: string;
  detailLevel?: 'brief' | 'full';
}

export interface AnalyzeChatResponse {
  reply: string;
  modelUsed: string;
  primarySkipped?: boolean;
  primaryError?: string | null;
  skippedModels?: Array<{ model: string; reason: string; status?: number }>;
}
