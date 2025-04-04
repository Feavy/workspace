import { getAuth } from "firebase-admin/auth";
import User from "~/backend/types/User";
import crypto from "node:crypto";

export default class AuthService {
  private static readonly INSTANCE = new AuthService();
  public static get() {
    return this.INSTANCE;
  }

  private readonly userCache: Map<string, User> = new Map();
  private readonly tokenByUid: Map<string, string> = new Map();

  public async registerUser(firebaseToken: string): Promise<{user: User, token: string}> {
    const decodedToken = await getAuth().verifyIdToken(firebaseToken);
    const existingToken = this.tokenByUid.get(decodedToken.uid);
    if(existingToken) {
      return {token: existingToken, user: this.userCache.get(existingToken)!};
    }

    const userData = await getAuth().getUser(decodedToken.uid);

    const email = decodedToken.email || userData.email || userData.providerData?.[0]?.email;

    const token = generateToken();

    const user = { uid: decodedToken.uid, email };

    this.userCache.set(token, user);
    this.tokenByUid.set(decodedToken.uid, token);

    return {user, token};
  }

  public getUser(token: string) {
    return this.userCache.get(token);
  }
}

function generateToken() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
}