import Game from "./game";
import AccountMenu from './account-menu';
import {getAccountUser} from '../lib/account-auth';
import {redirect} from 'next/navigation';
import Saves from './saves';
export const dynamic = 'force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{saveId?:string}>}) {
  const user = await getAccountUser();
  if(!user)redirect('/login');
  const {saveId}=await searchParams;
  return <><AccountMenu username={user.username}/>{saveId?<Game key={saveId}/>:<Saves/>}</>;
}
