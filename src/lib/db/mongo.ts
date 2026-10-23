import "server-only";
import { MongoClient, type Db } from "mongodb";
const globalMongo = globalThis as unknown as { actionflowMongo?: MongoClient };
export function getMongoClient() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Database connection is not configured.");
  return (globalMongo.actionflowMongo ??= new MongoClient(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 30000,
    connectTimeoutMS: 20000,
    timeoutMS: 45000,
    family: 4,
  }));
}
export function getDatabase(): Db {
  return getMongoClient().db(process.env.MONGODB_DB || "actionflow_ai");
}
