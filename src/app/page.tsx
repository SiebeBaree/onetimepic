import { Uploader } from "@/components/uploader";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-6 pb-20 pt-10 sm:pt-20">
      <section className="flex flex-col items-center text-center">
        <h1
          className="fade-up font-display text-4xl leading-[1.1] tracking-tight text-ivory sm:text-5xl"
          style={{ animationDelay: "40ms" }}
        >
          Share a photo that opens{" "}
          <span className="italic text-ember">once</span>.
        </h1>
      </section>

      <div className="fade-up mt-8" style={{ animationDelay: "200ms" }}>
        <Uploader />
      </div>
    </main>
  );
}
