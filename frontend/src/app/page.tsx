// Location: src/app/page.tsx
// Purpose: The Inkwell home page. This is the first page visitors see when they
// open the website at http://localhost:3000. It shows the site name, a short
// description, two buttons, and three feature cards.

export default function HomePage() {
  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      {/* Top navigation bar */}
      <header className="flex items-center justify-between border-b border-stone-200 px-6 py-4">
        <span className="text-2xl font-bold tracking-tight">Inkwell</span>
        <nav className="flex gap-4 text-sm">
          <a href="#" className="hover:underline">
            Stories
          </a>
          <a href="#" className="hover:underline">
            Writers
          </a>
          <a href="#" className="hover:underline">
            Sign in
          </a>
        </nav>
      </header>

      {/* Hero section: the big welcome message */}
      <section className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h1 className="text-4xl font-bold sm:text-5xl">
          Where stories find their readers
        </h1>
        <p className="mt-6 text-lg text-stone-600">
          Read stories from writers around the world, or share your own,
          chapter by chapter. Follow your favourite authors and support them
          directly.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <a
            href="#"
            className="rounded-lg bg-stone-900 px-6 py-3 text-white hover:bg-stone-700"
          >
            Start reading
          </a>
          <a
            href="#"
            className="rounded-lg border border-stone-300 px-6 py-3 hover:bg-stone-100"
          >
            Start writing
          </a>
        </div>
      </section>

      {/* Feature cards */}
      <section className="mx-auto grid max-w-5xl gap-6 px-6 pb-20 sm:grid-cols-3">
        <div className="rounded-xl border border-stone-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Read anywhere</h2>
          <p className="mt-2 text-sm text-stone-600">
            Dark mode, adjustable text size, and a library that remembers where
            you stopped.
          </p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Write your story</h2>
          <p className="mt-2 text-sm text-stone-600">
            Publish stories in chapters, save drafts, and watch your readers
            grow.
          </p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Support writers</h2>
          <p className="mt-2 text-sm text-stone-600">
            Send tips and gifts, or become a member for exclusive chapters.
          </p>
        </div>
      </section>
    </main>
  );
}

// Location: src/app/page.tsx
// End of file: page.tsx