import { ICommit } from "gitresources";
import * as moniker from "moniker";
import * as core from "../core";
import * as git from "../git-storage";
import * as utils from "../utils";

export interface IDocument {
    existing: boolean;
    docPrivateKey: string;
    docPublicKey: string;
};

async function getOrCreateObject(
    mongoManager: utils.MongoManager,
    documentsCollectionName: string,
    id: string,
    privateKey: string,
    publicKey: string): Promise<IDocument> {

    const db = await mongoManager.getDatabase();
    const collection = db.collection<any>(documentsCollectionName);

    // TODO there is probably a bit of a race condition with the below between the find and the insert
    const dbObjectP = collection.findOne(id);
    return dbObjectP.then(
        (dbObject) => {
            if (dbObject) {
                return { existing: true, docPrivateKey: dbObject._privateKey, docPublicKey: dbObject._publicKey };
            } else {
                return collection
                    .insertOne(id, { _privateKey: privateKey, _publicKey: publicKey, forks: [] })
                    .then(() => {
                        return {existing: false, docPrivateKey: privateKey, docPublicKey: publicKey};
                    });
            }
        });
}

export async function getOrCreateDocument(
    mongoManager: utils.MongoManager,
    documentsCollectionName: string,
    id: string,
    privateKey: string,
    publicKey: string): Promise<IDocument> {

    const getOrCreateP = getOrCreateObject(
        mongoManager,
        documentsCollectionName,
        id,
        privateKey,
        publicKey);

    return getOrCreateP;
}

export async function getLatestVersion(gitManager: git.GitManager, id: string): Promise<ICommit> {
    const commits = await gitManager.getCommits(id, 1);
    return commits.length > 0 ? commits[0] : null;
}

/**
 * Retrieves the forks for the given document
 */
export async function getForks(
    mongoManager: utils.MongoManager,
    documentsCollectionName: string,
    id: string): Promise<string[]> {

    const db = await mongoManager.getDatabase();
    const collection = db.collection<any>(documentsCollectionName);
    const document = await collection.findOne(id);

    return document.forks || [];
}

export async function createFork(
    producer: utils.kafkaProducer.IProducer,
    mongoManager: utils.MongoManager,
    documentsCollectionName: string,
    id: string): Promise<string> {

    const name = moniker.choose();

    // Insert the mongodb entry for the forked document?
    // This all assumes that the fork happens at the latest possible point. We can then probably just leverage
    // the state of the other document at that point in time.

    // Forking in the past would make sense to make a copy but then would you still want to CI it? Or could you
    // move back up later? Seems out of scope for this first round.

    // Broadcast the client connection message
    const rawMessage: core.ICreateForkMessage = {
        clientId: null,
        documentId: id,
        forkId: name,
        timestamp: Date.now(),
        type: core.CreateForkType,
        userId: null,
    };

    await producer.send(JSON.stringify(rawMessage), id);

    // const db = await mongoManager.getDatabase();
    // const collection = db.collection<any>(documentsCollectionName);
    // await collection.update(id, null, { forks: name });

    return name;
}
