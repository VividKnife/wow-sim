import Game from "./game";
import AccountMenu from './account-menu';
import {getAccountUser} from '../lib/account-auth';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const user = await getAccountUser();
  return <>{user && <AccountMenu username={user.username}/>}<Game /></>;
}
