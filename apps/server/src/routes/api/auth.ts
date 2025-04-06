import {APIEvent} from "@solidjs/start/server";
import {getCookie, setCookie} from "vinxi/http";
import {useFirebaseAdminApp} from "~/hooks/useFirebaseAdminApp";
import AuthService from "~/backend/services/AuthService";

useFirebaseAdminApp();

export async function POST(event: APIEvent) {
  const existingUser = AuthService.get().getUser(getCookie("token") || "");
  if(existingUser) {
    return existingUser;
  }

  const {token: firebaseToken} = await event.request.json();

  const {token, user} = await AuthService.get().registerUser(firebaseToken);
  setCookie(event.nativeEvent, "token", token, {
    httpOnly: true,
    // domain: BASE_DOMAIN, TODO
    path: "/",
    maxAge: 60 * 60 * 24 * 30 // 30 days
  })
  return user;
}