export const revalidate = 300;

/**
 * Home page placeholder — replaced by the profiles/search feature area with
 * headline national figures, featured insight cards, latest stories and the
 * combined place+indicator search box.
 */
export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">
        Nigeria&apos;s population and health, by place
      </h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        Clear numbers, maps and comparisons for every state, LGA and ward —
        each with its source. This page is under construction.
      </p>
    </div>
  );
}
