export async function runPublishStage(stage, operation) {
  try {
    return await operation();
  } catch (cause) {
    const originalError = cause instanceof Error ? cause : new Error(String(cause));
    const error = new Error(originalError.message, { cause: originalError });
    error.publishStage = stage;
    if (Number.isInteger(originalError.statusCode)) {
      error.statusCode = originalError.statusCode;
    }

    if (typeof originalError.publicMessage === 'string') {
      error.publicMessage = `${originalError.publicMessage} (publishing stage: ${stage})`;
    } else if (Number.isInteger(error.statusCode) && error.statusCode < 500) {
      error.publicMessage = originalError.message;
    } else if (
      stage === 'saving-upload-record' ||
      stage === 'saving-channel-memory' ||
      stage === 'cleaning-temporary-files'
    ) {
      error.publicMessage = `YouTube may already have accepted the video, but saving its app record failed during ${stage}. Check YouTube before retrying.`;
    } else {
      error.publicMessage = `Short publishing failed during ${stage}. Check backend logs for details before retrying.`;
    }
    throw error;
  }
}
