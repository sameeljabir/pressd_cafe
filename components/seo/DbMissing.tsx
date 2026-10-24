export default function DbMissing() {
  return (
    <div className="notice notice-error" role="alert">
      <h3>Database not configured</h3>
      <p>SEO Studio stores drafts, published settings and history in MongoDB. Set <code>MONGODB_URI</code> (MongoDB Atlas) for this environment and redeploy. Settings → Configuration shows what is missing.</p>
    </div>
  );
}
