// Netlify continuous-deployment guard.
// Exit 0 => skip/ignore the build. Exit 1 => continue the build.
// Only the verified manual GitHub production workflow is allowed to opt in.
const allowed=process.env.STOREOPS_ALLOW_NETLIFY_BUILD==='1';
if(allowed){
  console.log('StoreOps Netlify build explicitly authorized by verified release workflow.');
  process.exitCode=1;
}else{
  console.log('StoreOps Netlify Git build skipped to protect production build credits.');
  process.exitCode=0;
}
