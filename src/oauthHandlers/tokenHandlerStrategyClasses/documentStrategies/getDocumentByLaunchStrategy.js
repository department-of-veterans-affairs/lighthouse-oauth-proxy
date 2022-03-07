class GetDocumentByLaunchStrategy {
  constructor(req) {
    this.req = req;
  }

  /**
   * Build an object from the request body representing launch context.
   *
   * Note: Despite being labeled "document" this does not involve DynamoDB documents.
   * It "implements an interface", for convenience, that is used for other grant types
   * that do involve documents.
   *
   * @returns {Promise<{launch: *}>}
   */
  async getDocument() {
    return { launch: this.req.body.launch };
  }
}

module.exports = { GetDocumentByLaunchStrategy };
