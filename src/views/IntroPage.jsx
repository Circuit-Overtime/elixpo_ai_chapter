'use client';
import '../styles/intro/introStyle.css';

export default function IntroPage() {
  return (
    <>
      <div className="min-h-screen min-w-screen items-center flex flex-col bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 relative overflow-x-hidden">
        <section className="w-full h-[60px]">
          <div className="relative top-0 left-0 w-full h-[60px] border-b-2 border-[#1D202A] flex items-center bg-[#030712] z-[1000]">
            <div className="absolute left-[3%] h-10 w-10 rounded-full bg-[url('/logo.png')] bg-cover"></div>
            <p className="absolute left-[5%] text-3xl font-bold font-[Kanit,serif] text-[var(--text-primary)] cursor-pointer">
              LixBlogs
            </p>
            <ion-icon
              name="logo-github"
              class="githubLogo absolute left-[95%] text-[#888] text-2xl"
            ></ion-icon>
          </div>
        </section>

        <section className="max-w-[60%] my-auto bg-transparent mt-50 border-2 border-[#888] rounded-[15px] shadow-2xl w-full p-5 relative z-10 animate-fade-in-up">
          <div className="welcome-section mx-auto text-center mt-5">
            <h1 className="text-slate-50 text-3xl font-bold mb-3 bg-gradient-to-br from-slate-50 to-slate-300 bg-clip-text text-transparent">
              What's your name?
            </h1>
            <p className="text-slate-400 text-base">
              This will be your display name on LixBlogs
            </p>
          </div>

          <div className="step-content w-full">
            <label
              htmlFor="displayName"
              className="block mb-2 text-slate-200 font-medium text-md uppercase tracking-wider"
            >
              Display Name *
            </label>
            <input
              type="text"
              id="displayName"
              name="displayName"
              spellCheck={false}
              autoComplete="off"
              required
              className="mt-1 block w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-slate-200"
              placeholder="What shall we call you as?"
            />
          </div>
        </section>
      </div>

      <div
        id="cropperModal"
        className="fixed inset-0 bg-black bg-opacity-80 backdrop-blur flex items-center justify-center z-[2000] hidden"
      >
        <div className="bg-slate-800 p-6 w-[90%] max-w-[700px] rounded-lg shadow-2xl border border-slate-700">
          <h2 className="text-[var(--text-primary)] text-xl font-semibold mb-4 text-center">
            Edit & Crop Image
          </h2>
        </div>
      </div>

      <div id="sliderTemplates" style={{ display: "none", visibility: "hidden" }}>
        <input type="range" min="50" max="200" defaultValue="100" />
      </div>
    </>
  );
}
