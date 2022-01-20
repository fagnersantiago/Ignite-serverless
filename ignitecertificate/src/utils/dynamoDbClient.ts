import { DynamoDB } from "aws-sdk";

const Opitons = {
  region: process.env.IS_OFFLINE,
  endpoint: "http://localhost:8000",
};

const isOffline = () => {
  return process.env.IS_OFFLINE;
};

export const document = isOffline()
  ? new DynamoDB.DocumentClient(Opitons)
  : new DynamoDB.DocumentClient();
