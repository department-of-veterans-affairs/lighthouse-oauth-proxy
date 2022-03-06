const { decodeBase64Launch } = require("../../../utils");
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
    let doc = {};
    // Only applies to launch or launch/patient
    if (
      this.req.body.scope &&
      this.req.body.scope.split(" ").includes("launch")
    ) {
      doc.launch = this.req.body.launch;
    }
    if (
      this.req.body.scope &&
      !this.req.body.scope.split(" ").includes("launch/patient")
    ) {
      doc.isLaunch = true;
      doc.decodedLaunch = decodeBase64Launch(doc.launch);
    }
    return doc;
  }
}

module.exports = { GetDocumentByLaunchStrategy };
