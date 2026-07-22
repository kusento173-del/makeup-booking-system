export class InitialAdminAlreadyExistsError extends Error {
  constructor() {
    super('An active administrator already exists');
    this.name = 'InitialAdminAlreadyExistsError';
  }
}

export class InitialAdminInputInvalidError extends Error {
  constructor() {
    super('The administrator details are invalid');
    this.name = 'InitialAdminInputInvalidError';
  }
}

export class InitialAdminLoginNameExistsError extends Error {
  constructor() {
    super('The login name is already in use');
    this.name = 'InitialAdminLoginNameExistsError';
  }
}
