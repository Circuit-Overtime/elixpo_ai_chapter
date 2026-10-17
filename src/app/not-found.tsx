"use client";

import { useRouter } from "next/navigation";

export default function NotFound() {
  const router = useRouter();

  return (
    <div
      className="flex items-center justify-center min-h-screen p-5"
      style={{
        fontFamily: "'Nunito Sans', 'Parkinsans', sans-serif",
        background: "#ffc",
      }}
    >
      <div className="w-[90%] max-w-[1100px] mx-auto">
        <div className="flex flex-wrap items-center justify-center max-md:flex-col">
          <div className="flex-[0_0_50%] max-w-[50%] p-5 max-md:flex-[0_0_100%] max-md:max-w-full max-md:text-center">
            <svg
              version="1.1"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 800 600"
              className="w-full max-w-[500px] h-auto block mx-auto"
            >
              <g>
                <defs>
                  <clipPath id="GlassClip">
                    <path d="M380.857,346.164c-1.247,4.651-4.668,8.421-9.196,10.06c-9.332,3.377-26.2,7.817-42.301,3.5s-28.485-16.599-34.877-24.192c-3.101-3.684-4.177-8.66-2.93-13.311l7.453-27.798c0.756-2.82,3.181-4.868,6.088-5.13c6.755-0.61,20.546-0.608,41.785,5.087s33.181,12.591,38.725,16.498c2.387,1.682,3.461,4.668,2.705,7.488L380.857,346.164z" />
                  </clipPath>
                </defs>
                <g id="planet">
                  <circle fill="none" stroke="#0E0620" strokeWidth="3" strokeMiterlimit="10" cx="572.859" cy="108.803" r="90.788" />
                  <circle fill="none" stroke="#0E0620" strokeWidth="3" strokeMiterlimit="10" cx="548.891" cy="62.319" r="13.074" />
                  <circle fill="none" stroke="#0E0620" strokeWidth="3" strokeMiterlimit="10" cx="591.743" cy="158.918" r="7.989" />
                  <path fill="none" stroke="#0E0620" strokeWidth="3" strokeLinecap="round" strokeMiterlimit="10" d="M476.562,101.461c-30.404,2.164-49.691,4.221-49.691,8.007c0,6.853,63.166,12.408,141.085,12.408s141.085-5.555,141.085-12.408c0-3.378-15.347-4.988-40.243-7.225" />
                </g>
                <g id="spaceman">
                  <path fill="#FFFFFF" stroke="#0E0620" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeMiterlimit="10" d="M338.164,454.689l-64.726-17.353c-11.086-2.972-17.664-14.369-14.692-25.455l15.694-58.537c3.889-14.504,18.799-23.11,33.303-19.221l52.349,14.035c14.504,3.889,23.11,18.799,19.221,33.303l-15.694,58.537C360.647,451.083,349.251,457.661,338.164,454.689z" />
                  <g id="head">
                    <ellipse transform="matrix(0.259 -0.9659 0.9659 0.259 -51.5445 563.2371)" fill="#FFFFFF" stroke="#0E0620" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeMiterlimit="10" cx="341.295" cy="315.211" rx="61.961" ry="60.305" />
                    <path fill="#FFFFFF" stroke="#0E0620" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeMiterlimit="10" d="M380.857,346.164c-1.247,4.651-4.668,8.421-9.196,10.06c-9.332,3.377-26.2,7.817-42.301,3.5s-28.485-16.599-34.877-24.192c-3.101-3.684-4.177-8.66-2.93-13.311l7.453-27.798c0.756-2.82,3.181-4.868,6.088-5.13c6.755-0.61,20.546-0.608,41.785,5.087s33.181,12.591,38.725,16.498c2.387,1.682,3.461,4.668,2.705,7.488L380.857,346.164z" />
                  </g>
                  <g id="legs">
                    <path fill="#FFFFFF" stroke="#0E0620" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeMiterlimit="10" d="M312.957,456.734l-14.315,53.395c-1.896,7.07,2.299,14.338,9.37,16.234l0,0c7.07,1.896,14.338-2.299,16.234-9.37l17.838-66.534C333.451,455.886,323.526,457.387,312.957,456.734z" />
                    <path fill="#FFFFFF" stroke="#0E0620" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeMiterlimit="10" d="M296.315,452.273L282,505.667c-1.896,7.07-9.164,11.265-16.234,9.37l0,0c-7.07-1.896-11.265-9.164-9.37-16.234l17.838-66.534C278.993,441.286,286.836,447.55,296.315,452.273z" />
                  </g>
                </g>
              </g>
            </svg>
          </div>
          <div className="flex-[0_0_50%] max-w-[50%] p-5 max-md:flex-[0_0_100%] max-md:max-w-full max-md:text-center">
            <h1
              className="text-[7.5em] max-md:text-[4em] my-4 font-bold leading-none"
              style={{ color: "#0f6d78", textShadow: "2px 2px 0 #ddb581" }}
            >
              404
            </h1>
            <h2 className="font-bold my-2.5 text-[#222]">UH OH! You&apos;re lost.</h2>
            <p className="text-[1.2em] mb-8 text-[#222]">
              The page you are looking for does not exist. How you got here is a mystery.
              But you can click the button below to go back to the homepage.
            </p>
            <button
              onClick={() => router.push("/")}
              className="bg-transparent px-12 py-2 rounded-[30px] cursor-pointer text-base tracking-widest font-bold transition-all duration-200 border-4"
              style={{ borderColor: "#ddb581", color: "#0f6d78" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#0f6d78";
                e.currentTarget.style.color = "#ffc";
                e.currentTarget.style.borderColor = "#ffc";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "#0f6d78";
                e.currentTarget.style.borderColor = "#ddb581";
              }}
            >
              HOME
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
