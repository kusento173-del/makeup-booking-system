const nativeDate = Date;
const configuredNow = process.env.SIMULATED_NOW;

if (process.env.NODE_ENV !== 'test' || !configuredNow) {
  throw new Error('The simulated clock is only available in test mode');
}

const simulatedTimestamp = nativeDate.parse(configuredNow);
if (!Number.isFinite(simulatedTimestamp)) {
  throw new Error('SIMULATED_NOW must be a valid ISO timestamp');
}

class SimulatedDate extends nativeDate {
  constructor(...arguments_) {
    super(...(arguments_.length === 0 ? [simulatedTimestamp] : arguments_));
  }

  static now() {
    return simulatedTimestamp;
  }
}

globalThis.Date = SimulatedDate;
