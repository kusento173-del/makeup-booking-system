import type { AccountBindingTarget, AuthFlowResult } from './auth-session';

type BindingRequired = Extract<AuthFlowResult, { kind: 'BINDING_REQUIRED' }>;

interface BindingFlowInput {
  readonly binding: BindingRequired;
  readonly bindingCode: string;
  readonly target: AccountBindingTarget;
}

interface BindingFlowDependencies {
  readonly bind: (input: {
    readonly bindingChallenge: string;
    readonly bindingCode: string;
    readonly target: AccountBindingTarget;
  }) => Promise<AuthFlowResult>;
  readonly login: () => Promise<AuthFlowResult>;
  readonly now?: () => number;
}

export function bindingChallengeExpired(expiresAt: string, now = Date.now()): boolean {
  const expiry = Date.parse(expiresAt);
  return !Number.isFinite(expiry) || expiry <= now;
}

function isExpiredChallengeError(cause: unknown): boolean {
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    cause.code === 'BINDING_CHALLENGE_INVALID'
  );
}

export async function submitBindingWithRefresh(
  input: BindingFlowInput,
  dependencies: BindingFlowDependencies,
): Promise<AuthFlowResult> {
  let binding = input.binding;

  if (bindingChallengeExpired(binding.bindingChallengeExpiresAt, dependencies.now?.())) {
    const loginResult = await dependencies.login();
    if (loginResult.kind !== 'BINDING_REQUIRED') return loginResult;
    binding = loginResult;
  }

  const submit = (activeBinding: BindingRequired) =>
    dependencies.bind({
      bindingChallenge: activeBinding.bindingChallenge,
      bindingCode: input.bindingCode,
      target: input.target,
    });

  try {
    return await submit(binding);
  } catch (cause) {
    if (!isExpiredChallengeError(cause)) throw cause;

    const loginResult = await dependencies.login();
    return loginResult.kind === 'BINDING_REQUIRED' ? submit(loginResult) : loginResult;
  }
}

export type { AccountBindingTarget, AuthFlowResult };
