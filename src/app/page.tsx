import { Uploader } from "@/components/uploader";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-5 pb-16 pt-16 sm:pt-24">
      <section className="flex flex-col items-center text-center">
        <h1
          className="rise text-[40px] font-semibold leading-[1.05] tracking-[-0.035em] text-frost sm:text-[54px]"
          style={{ animationDelay: "40ms" }}
        >
          Share a photo
          <br />
          that opens <span className="text-aurora">once</span>.
        </h1>
        <p
          className="rise mt-5 max-w-sm text-[17px] leading-relaxed text-mist"
          style={{ animationDelay: "140ms" }}
        >
          Encrypted on your device. Gone after one view. No account.
        </p>
      </section>

      <div className="rise mt-12" style={{ animationDelay: "260ms" }}>
        <Uploader />
      </div>
    </main>
  );
}
