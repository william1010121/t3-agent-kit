// Stand-in for upstream's managed Codex runtime (T3's token-sharing ChatGPT login); only its type is used.
import type { CodexSettings } from "@t3-agent-kit/contracts";

export interface CodexEffectiveRuntime {
  readonly config: CodexSettings;
  readonly environment: NodeJS.ProcessEnv;
  readonly revision: string;
}
