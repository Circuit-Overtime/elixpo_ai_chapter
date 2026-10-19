'use client';

import Link from "next/link";

export default function PublisherPage() {
    return  ( 
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
        <div className="settingsSection flex flex-row h-full w-full h-full box-border">

        <section className="relative flex flex-row h-full w-full box-border border-t-2 border-[#1D202A]">
            <div className="profileInformation w-[20%] h-full bg-[#10141E] px-5 box-border flex flex-col items-center">
                <div className="profileControlButtons flex-col w-full mt-5 py-10 box-border">
                    <div className="controlButton selected relative h-[40px] w-full bg-[#1D202A] rounded-[8px] flex flex-row mb-5 px-2 box-border cursor-pointer gap-[10px] items-center text-[1.3em] hover:bg-[#313647] hover:text-[var(--text-primary)] transition-all duration-300">
                        <ion-icon name="home-outline" className="text-[#7ba8f0] text-[0.9em]"></ion-icon>
                        <p className="text-[#7ba8f0] text-[0.9em]">Home</p>
                    </div>
                <div className="controlButton relative h-[40px] w-full bg-[#1D202A] rounded-[8px] flex flex-row mb-5 px-2 cursor-pointer gap-[10px] items-center text-[1.3em] hover:bg-[#313647] hover:text-[var(--text-primary)] transition-all duration-300">
                        <ion-icon name="bookmark-outline" className="text-[#7ba8f0] text-[0.9em]"></ion-icon>
                        <p className="text-[#7ba8f0] text-[0.9em]">Library</p>
                    </div>
                    <div className="controlButton relative h-[40px] w-full bg-[#1D202A] rounded-[8px] flex flex-row mb-15 px-2 cursor-pointer gap-[10px] items-center text-[1.3em] hover:bg-[#313647] hover:text-[var(--text-primary)] transition-all duration-300">
                        <ion-icon name="person-outline" className="text-[#7ba8f0] text-[0.9em]"></ion-icon>
                        <p className="text-[#7ba8f0] text-[0.9em]">Profile</p>
                    </div>


                    <div className="controlButton relative h-[40px] w-full bg-[#1D202A] rounded-[8px] flex flex-row mt-20 mb-5 px-2 cursor-pointer gap-[10px] items-center text-[1.3em] hover:bg-[#313647] hover:text-[var(--text-primary)] transition-all duration-300">
                        <ion-icon name="book-outline" className="text-[#7ba8f0] text-[0.9em]"></ion-icon>
                        <p className="text-[#7ba8f0] text-[0.9em]">Stories</p>
                    </div>
                    <div className="controlButton relative h-[40px] w-full bg-[#1D202A] rounded-[8px] flex flex-row mb-5 px-2 cursor-pointer gap-[10px] items-center text-[1.3em] hover:bg-[#313647] hover:text-[var(--text-primary)] transition-all duration-300">
                        <ion-icon name="stats-chart-outline" className="text-[#7ba8f0] text-[0.9em]"></ion-icon>
                        <p className="text-[#7ba8f0] text-[0.9em]">Stats</p>
                    </div>


                    <div className="userInfo flex items-center gap-2 w-full h-[50px] px-3 rounded-[12px] bg-[#10141E] shadow-[6px_6px_12px_#0b0e16,-6px_-6px_12px_#171c28]">
                        <div className="userLogo flex-shrink-0 h-[35px] w-[35px] rounded-full bg-[#888] shadow-[inset_3px_3px_6px_#777,inset_-3px_-3px_6px_#999]"></div>
                        <span className="text-[var(--text-primary)] text-lg font-medium cursor-pointer userOrganization truncate">Ayushman Bhattacharya</span>
                    </div>

                </div>
            </div>

            <div className="settingsControl w-[80%] h-full max-h-[calc(100vh-80px)] overflow-y-auto bg-[#030712] px-10 box-border flex flex-col items-start">
                <div className="settingsHeader w-full h-[30%] flex flex-row items-center ">
                    <h1 className="text-[var(--text-primary)] text-[4em] my-auto font-bold">Settings</h1>
                </div>

                <div className="settingsNav flex flex-row w-full h-[10%] items-center justify-left gap-10 mt-2 border-b-2 border-[#1D202A]">
                    <p className="settingsNavItem text-[#888] text-lg cursor-pointer select-none">Account</p>
                    <p className="settingsNavItem text-[#888] text-lg cursor-pointer selected underline  select-none">Publisher</p>
                    <Link
                    href="/settings/notifications"
                    className="settingsNavItem text-[#888] text-lg cursor-pointer select-none"
                    >
                    Notification
                    </Link>
                    <p className="settingsNavItem text-[#888] text-lg cursor-pointer select-none">Organisation</p>
                </div>

                <div className="publisherSettings flex flex-col w-full mt-10 gap-5">

                    <div className="settingBox flex flex-row justify-between w-full">
                        <p className="text-[var(--text-primary)] text-lg select-none">Allow users to comment?</p>
                        <div className="freq flex flex-row gap-5">
                        <p className="optionalSetting text-[#888] hover:text-[var(--text-primary)] text-lg select-none cursor-pointer selected"><span> Yes </span></p>
                        <p className="optionalSetting text-[#888] hover:text-[var(--text-primary)] text-lg select-none cursor-pointer"><span> Nope </span></p>
                        </div>
                    </div>
                    <div className="settingBox flex flex-row justify-between w-full">
                        <p className="text-[var(--text-primary)] text-lg select-none">Allow users to tag you in their posts?</p>
                        <div className="freq flex flex-row gap-5">
                        <p className="optionalSetting text-[#888] hover:text-[var(--text-primary)] text-lg select-none cursor-pointer selected"><span> Yes </span></p>
                        <p className="optionalSetting text-[#888] hover:text-[var(--text-primary)] text-lg select-none cursor-pointer"><span> Nope </span></p>
                        </div>
                    </div>
                    <div className="settingBox flex flex-row justify-between w-full">
                        <p className="text-[var(--text-primary)] text-lg select-none">Allow email replies?</p>
                        <div className="freq flex flex-row gap-5">
                        <p className="optionalSetting text-[#888] hover:text-[var(--text-primary)] text-lg select-none cursor-pointer"><span> Yes </span></p>
                        <p className="optionalSetting text-[#888] hover:text-[var(--text-primary)] text-lg select-none cursor-pointer selected"><span> Nope </span></p>
                        </div>
                    </div>
                    <div className="settingBox flex flex-row justify-between w-full">
                        <p className="text-[var(--text-primary)] text-lg select-none">Default Reply Email Address</p>
                        <p className="text-[#888] hover:text-[var(--text-primary)] text-lg select-none cursor-pointer">user@example.com</p>
                    </div>
                    <div className="settingBox flex flex-row justify-between w-full">
                        <p className="text-[var(--text-primary)] text-lg select-none">Publisher Visibility</p>
                        <div className="freq flex flex-row gap-5">
                        <p className="optionalSetting text-[#888] hover:text-[var(--text-primary)] text-lg select-none cursor-pointer selected"><span> Public </span></p>
                        <p className="optionalSetting text-[#888] hover:text-[var(--text-primary)] text-lg select-none cursor-pointer"><span> Private </span></p>
                        </div>
                    </div>
                    <div className="settingBox flex flex-row justify-between w-full">
                        <p className="text-[var(--text-primary)] text-lg select-none">Publisher Verification</p>
                        <div className="freq flex flex-row gap-5">
                        <p className="optionalSetting text-[#888] hover:text-[var(--text-primary)] text-lg select-none cursor-pointer selected"><span> Verified <ion-icon name="shield-checkmark" className="relative mt-2"></ion-icon> </span></p>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        </div>
    </div>
    )
}