const { hashString } = require("../../../utils");
const { getUnixTime } = require("date-fns");

class SaveDocumentLaunchStrategy {
  constructor(logger, dynamoClient, config) {
    this.logger = logger;
    this.dynamoClient = dynamoClient;
    this.config = config;
  }
  async saveDocumentToDynamo(document, tokens) {

    if (document.launch) {
      let launch = document.launch;
      
      if(!tokens.scope.split(" ").includes("launch/patient") && !this.launchValidation(launch) ){ 
          throw {
            status: 400,
              error: "invalid_request",
              error_description: "The provided patient launch must be a string",
          }
      }
    }
    try {
      let accessToken = hashString(
        tokens.access_token,
        this.config.hmac_secret
      );
      let payload = {
        access_token: accessToken,
        launch: launch,
        expires_on: getUnixTime(new Date()) + tokens.expires_in,
      };
      await this.dynamoClient.savePayloadToDynamo(
        payload,
        this.config.dynamo_launch_context_table
      );
    } catch (error) {
      this.logger.error(
        "Could not update the access token token in DynamoDB",
        error
      );
    }
  }
  launchValidation(launch){
    if(launch === null || launch ==="") return false;
    var base64regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
    if(base64regex.test(launch)) {
      let decodedLaunch = JSON.parse(
        Buffer.from(launch, "base64").toString("ascii")
      );
      if(!decodedLaunch['patient'] || typeof(decodedLaunch['patient']) != typeof('string')) {
        return false;
      }
    }
    else {
      if(launch === "" || Object.keys(launch).length ===0){
        return false;
      }
      else if(!launch.hasOwnProperty('patient') || typeof(launch['patient']) != typeof('string')) return false;
    }
    return true;
  }
}

module.exports = { SaveDocumentLaunchStrategy };
