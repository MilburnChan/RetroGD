export default function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center justify-center p-6">
      <div className="pixel-panel p-6 text-center">
        <p className="text-sm">页面不存在</p>
        <p className="mt-3 text-xs text-[#d8ccb8]">请返回大厅重新进入房间。</p>
        <a className="pixel-btn mt-4 inline-block" href="/">
          返回大厅
        </a>
      </div>
    </main>
  );
}
