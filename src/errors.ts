export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}

export class OperationCancelledError extends UserFacingError {
  constructor(message: string) {
    super(message);
    this.name = 'OperationCancelledError';
  }
}
