'use client';
import { useEffect } from 'react';
import "../../../styles/history/history.css";



const HistoryCard = () => (
  <div className="recommendCard relative shrink-0 flex flex-col w-[80%] h-[250px] bg-[#1D202A] rounded-[8px] mx-auto p-5 box-border mb-5">
    <div className="attributionCard flex flex-row gap-2 w-full h-[30px]">
      <div className="logo h-[25px] w-[25px] rounded-[8px] bg-[#888]"></div>
      <span className="text-[#fff] underline cursor-pointer organization">Elixpo Organization</span>
      <span className="text-[#888]">by</span>
      <span className="text-[#fff] cursor-pointer author">John Doe</span>
    </div>
    <div className="contentInfo flex flex-row w-full gap-2">
      <div className="contentTitle flex flex-col gap-1 w-[75%] box-border">
        <p className="contentText text-[#fff] text-[2em] font-extrabold">
          Lorem ipsum dolor sit amet, consectetur adipiscing elit.
        </p>
        <p className="contentDesc text-[#888] text-[1em]">
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vivamus lacinia odio vitae vestibulum.
        </p>
      </div>
      <div className="contentImage w-[25%] h-[90%] bg-[#888] rounded-[8px]"></div>
    </div>
    <div className="postAttributes w-full flex flex-row mt-5 gap-5 justify-between">
      <div className="leftSection w-[50%] flex flex-row gap-5">
        <p className="date text-[#888] text-[1em]">Aug 10</p>
        <p className="views text-[#888] text-[1em] flex-row items-center">
          <ion-icon name="heart"></ion-icon> 1.2K views
        </p>
        <p className="comments text-[#888] text-[1em] flex-row items-center">
          <ion-icon name="chatbubble"></ion-icon> 0
        </p>
      </div>
      <div className="rightSection w-[50%] flex flex-row gap-5">
        <ion-icon name="remove-circle-outline" className="text-[#888] text-[1.3em] cursor-pointer hover:text-[#7ba8f0]"></ion-icon>
        <ion-icon name="add-circle-outline" className="text-[#888] text-[1.3em] cursor-pointer hover:text-[#7ba8f0]"></ion-icon>
        <ion-icon name="bookmark-outline" className="text-[#888] text-[1.3em] cursor-pointer hover:text-[#7ba8f0]"></ion-icon>
        <ion-icon name="person-add-outline" className="text-[#888] text-[1.3em] cursor-pointer hover:text-[#7ba8f0]"></ion-icon>
      </div>
    </div>
  </div>
);

export default function HistoryPage() {
  useEffect(() => {
    document.title = "History - LixBlogs";
  }, []);

  return (
    <div className="container absolute flex flex-col h-full max-w-[2560px] bg-[#030712] box-border">
      <section className="w-full h-[60px]">
        <div className="relative top-0 left-0 w-full h-[60px] border-b-2 border-[#1D202A] flex items-center bg-[#030712] z-[1000]">
          <div className="absolute left-[3%] h-10 w-10 rounded-full bg-[url('/logo.png')] bg-cover"></div>
          <p className="absolute left-[5%] text-3xl font-bold font-[Kanit,serif] text-[var(--text-primary)] cursor-pointer">LixBlogs</p>
          <div className="absolute left-[80%] text-[var(--text-primary)] text-[1.3em] cursor-pointer px-2.5 py-1.5 bg-[#10141E] border border-[#7ba8f0] rounded-[15px] flex items-center">
            <ion-icon name="pencil" className="text-[0.8em] mr-1 text-[#7ba8f0]"></ion-icon>
            Write
          </div>
          <div className="absolute left-[88%] text-[var(--text-primary)] text-[1.3em] cursor-pointer">Sign-In</div>
          <ion-icon name="logo-github" className="githubLogo absolute left-[95%] text-[#888] text-2xl"></ion-icon>
        </div>
      </section>

      <div className="historySection flex flex-row h-full w-full box-border">
        <section className="relative flex flex-row h-full w-full box-border border-t-2 border-[#1D202A]">
          {/* Left Sidebar */}
          <div className="profileInformation w-[20%] h-full bg-[#10141E] px-5 box-border flex flex-col items-center">
            <div className="profileControlButtons flex flex-col w-full mt-5 py-10 box-border">
              {/* Sidebar buttons */}
              {/* Add your buttons here, same as original */}
            </div>
          </div>

          {/* Right Content Area */}
          <div className="historyControl w-[80%] h-full max-h-[calc(100vh-80px)] overflow-y-auto bg-[#030712] px-10 box-border flex flex-col items-start">
            <div className="historyHeader w-full h-[30%] flex flex-row items-center">
              <h1 className="text-[var(--text-primary)] text-[4em] my-auto font-bold">Reading History</h1>
            </div>

            <div className="historyNav flex flex-row w-full h-[10%] items-center justify-left gap-10 mt-2 border-b-2 border-[#1D202A]">
              <p className="historyNavItem text-[#888] text-lg cursor-pointer select-none">Collection</p>
              <p className="historyNavItem text-[#888] text-lg cursor-pointer select-none">Saved Collections</p>
              <p className="historyNavItem text-[#7ba8f0] text-lg cursor-pointer selected underline select-none">Read History</p>
            </div>

            <div className="historyOverview flex flex-col w-full h-full gap-5 overflow-hidden">
              <div className="historyContent flex flex-col gap-5 mt-5 max-h-[95%] overflow-y-auto">
                <HistoryCard />
                <HistoryCard />
                <HistoryCard />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
