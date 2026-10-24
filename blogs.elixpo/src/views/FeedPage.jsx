'use client';
import { useEffect } from 'react';
import '../styles/community/trending.css'
import AuthorAttribution from '@/components/AuthorAttribution'

export default function FeedPage() {
    useEffect(() => { document.title = "LixBlogs - Feed"; }, []);
    return (
        <div className="container absolute flex flex-col h-full max-w-[2560px] bg-[var(--bg-base)] box-border">
            <section className="w-full h-[60px]">
                <div className="relative top-0 left-0 w-full h-[60px] border-b-2 border-[#1D202A] flex items-center bg-[var(--bg-base)] z-[1000]">
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

            <section className="trending pseudo relative flex flex-row items-center w-full h-[40px] bg-[#10141E] px-20 box-border">
                <input
                    type="text"
                    placeholder="Ctrl K"
                    className="w-[30%] h-[40px] bg-[#1D202A] text-[var(--text-primary)] rounded-[20px] px-4 outline-none border border-[#888] focus:border-[#7ba8f0]"
                />
                <div className="trendingTopics h-[40px] max-w-full overflow-x-auto flex flex-row gap-[5px] px-5 box-border ml-[5px] items-center flex-nowrap scrollbar-thin scrollbar-thumb-[#7ba8f0] whitespace-nowrap">
                    <div className="topic ai-recommend relative h-[80%] px-5 flex flex-row gap-[5px] items-center justify-center bg-[#1D202A] rounded-[8px] cursor-pointer hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] transition-all duration-300">
                        <ion-icon name="sparkles" className="rotate-[25deg] text-[#7ba8f0] mr-1 mt-1"></ion-icon>
                        <p className="text-[#7ba8f0] text-[1em] font-bold"> For You</p>
                    </div>
                    <div className="topic relative h-[80%] px-3 box-border flex items-center justify-center bg-[#1D202A] rounded-[8px] cursor-pointer hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] transition-all duration-300">
                        <p className="text-[#7ba8f0] text-[1em] font-bold">Web Development</p>
                    </div>
                    <div className="topic relative h-[80%] px-3 box-border flex items-center justify-center bg-[#1D202A] rounded-[8px] cursor-pointer hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] transition-all duration-300">
                        <p className="text-[#7ba8f0] text-[1em] font-bold">App Analytics</p>
                    </div>
                    <div className="topic relative h-[80%] px-3 box-border flex items-center justify-center bg-[#1D202A] rounded-[8px] cursor-pointer hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] transition-all duration-300">
                        <p className="text-[#7ba8f0] text-[1em] font-bold">Dev-ops</p>
                    </div>
                    <div className="topic relative h-[80%] px-3 box-border flex items-center justify-center bg-[#1D202A] rounded-[8px] cursor-pointer hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] transition-all duration-300">
                        <p className="text-[#7ba8f0] text-[1em] font-bold">Dev-ops</p>
                    </div>
                    <div className="topic relative h-[80%] px-3 box-border flex items-center justify-center bg-[#1D202A] rounded-[8px] cursor-pointer hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] transition-all duration-300">
                        <p className="text-[#7ba8f0] text-[1em] font-bold">Dev-ops</p>
                    </div>
                    <div className="topic relative h-[80%] px-3 box-border flex items-center justify-center bg-[#1D202A] rounded-[8px] cursor-pointer hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] transition-all duration-300">
                        <p className="text-[#7ba8f0] text-[1em] font-bold">Dev-ops</p>
                    </div>
                    <div className="topic relative h-[80%] px-3 box-border flex items-center justify-center bg-[#1D202A] rounded-[8px] cursor-pointer hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] transition-all duration-300">
                        <p className="text-[#7ba8f0] text-[1em] font-bold">Dev-ops</p>
                    </div>
                </div>
            </section>
            <section className="recommendations relative flex flex-row h-full w-full box-border border-t-2 border-[#1D202A]">
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

                <div className="recommendationCards w-[50%] h-full bg-[#10141E] box-border flex flex-col items-left justify-start">
                    <div className="recommendationContainer relative w-full max-h-[75%] overflow-y-auto flex flex-col items-center box-border mt-10">
                        {/* Card 1: Org + single author */}
                        <div className="recommendCard relative shrink-0 flex flex-col w-[98%] h-[250px] bg-[#1D202A] rounded-[8px] mx-auto p-5 box-border mb-5">
                            <AuthorAttribution
                              org={{ name: 'Elixpo Organization' }}
                              authors={[{ name: 'John Doe' }]}
                            />
                            <div className="contentInfo flex flex-row w-full gap-2">
                                <div className="contentTitle flex flex-col gap-1 w-[75%] box-border">
                                    <p className="contentText text-[#fff] text-[2em] font-extrabold">Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
                                    <p className="contentDesc text-[#888] text-[1em]">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vivamus lacinia odio vitae vestibulum.</p>
                                </div>
                                <div className="contentImage w-[25%] h-[90%] bg-[#888] rounded-[8px]"></div>
                            </div>
                            <div className="postAttributes w-full flex flex-row mt-5 gap-5 justify-between">
                                <div className="leftSection w-[50%] flex flex-row gap-5">
                                    <p className="date text-[#888] text-[1em]">Aug 10</p>
                                    <p className="views text-[#888] text-[1em] flex-row items-center"><ion-icon name="heart"></ion-icon> 1.2K views</p>
                                    <p className="comments text-[#888] text-[1em] flex-row items-center"><ion-icon name="chatbubble"></ion-icon> 0 </p>
                                </div>
                                <div className="rightSection w-[50%] flex flex-row gap-5">
                                    <ion-icon name="remove-circle-outline" className="text-[#888] text-[1.3em] cursor-pointer hover:text-[#7ba8f0]"></ion-icon>
                                    <ion-icon name="add-circle-outline" className="text-[#888] text-[1.3em] cursor-pointer hover:text-[#7ba8f0]"></ion-icon>
                                    <ion-icon name="bookmark-outline" className="text-[#888] text-[1.3em] cursor-pointer hover:text-[#7ba8f0]"></ion-icon>
                                    <ion-icon name="person-add-outline" className="text-[#888] text-[1.3em] cursor-pointer hover:text-[#7ba8f0]"></ion-icon>
                                </div>
                            </div>
                        </div>

                        {/* Card 2: Org + multiple authors (+ 2 others) */}
                        <div className="recommendCard relative shrink-0 flex flex-col w-[98%] h-[250px] bg-[#1D202A] rounded-[8px] mx-auto p-5 box-border mb-5">
                            <AuthorAttribution
                              org={{ name: 'Elixpo Organization' }}
                              authors={[{ name: 'John Doe' }, { name: 'Jane Smith' }, { name: 'Alex Lee' }]}
                            />
                            <div className="contentInfo flex flex-row w-full gap-2">
                                <div className="contentTitle flex flex-col gap-1 w-[75%] box-border">
                                    <p className="contentText text-[#fff] text-[2em] font-extrabold">Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
                                    <p className="contentDesc text-[#888] text-[1em]">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vivamus lacinia odio vitae vestibulum.</p>
                                </div>
                                <div className="contentImage w-[25%] h-[90%] bg-[#888] rounded-[8px]"></div>
                            </div>
                            <div className="postAttributes w-full flex flex-row mt-5 gap-5 justify-between">
                                <div className="leftSection w-[50%] flex flex-row gap-5">
                                    <p className="date text-[#888] text-[1em]">Aug 10</p>
                                    <p className="views text-[#888] text-[1em] flex-row items-center"><ion-icon name="heart"></ion-icon> 1.2K views</p>
                                    <p className="comments text-[#888] text-[1em] flex-row items-center"><ion-icon name="chatbubble"></ion-icon> 0 </p>
                                </div>
                                <div className="rightSection w-[50%] flex flex-row gap-5">
                                    <ion-icon name="remove-circle-outline" className="text-[#888] text-[1.3em] cursor-pointer hover:text-[#7ba8f0]"></ion-icon>
                                    <ion-icon name="add-circle-outline" className="text-[#888] text-[1.3em] cursor-pointer hover:text-[#7ba8f0]"></ion-icon>
                                    <ion-icon name="bookmark-outline" className="text-[#888] text-[1.3em] cursor-pointer hover:text-[#7ba8f0]"></ion-icon>
                                    <ion-icon name="person-add-outline" className="text-[#888] text-[1.3em] cursor-pointer hover:text-[#7ba8f0]"></ion-icon>
                                </div>
                            </div>
                        </div>

                        {/* Card 3: Personal blog (no org) */}
                        <div className="recommendCard relative shrink-0 flex flex-col w-[98%] h-[250px] bg-[#1D202A] rounded-[8px] mx-auto p-5 box-border mb-5">
                            <AuthorAttribution
                              authors={[{ name: 'Sarah Connor' }]}
                            />
                            <div className="contentInfo flex flex-row w-full gap-2">
                                <div className="contentTitle flex flex-col gap-1 w-[75%] box-border">
                                    <p className="contentText text-[#fff] text-[2em] font-extrabold">Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
                                    <p className="contentDesc text-[#888] text-[1em]">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vivamus lacinia odio vitae vestibulum.</p>
                                </div>
                                <div className="contentImage w-[25%] h-[90%] bg-[#888] rounded-[8px]"></div>
                            </div>
                            <div className="postAttributes w-full flex flex-row mt-5 gap-5 justify-between">
                                <div className="leftSection w-[50%] flex flex-row gap-5">
                                    <p className="date text-[#888] text-[1em]">Aug 10</p>
                                    <p className="views text-[#888] text-[1em] flex-row items-center"><ion-icon name="heart"></ion-icon> 1.2K views</p>
                                    <p className="comments text-[#888] text-[1em] flex-row items-center"><ion-icon name="chatbubble"></ion-icon> 0 </p>
                                </div>
                                <div className="rightSection w-[50%] flex flex-row gap-5">
                                    <ion-icon name="remove-circle-outline" className="text-[#888] text-[1.3em] cursor-pointer hover:text-[#7ba8f0]"></ion-icon>
                                    <ion-icon name="add-circle-outline" className="text-[#888] text-[1.3em] cursor-pointer hover:text-[#7ba8f0]"></ion-icon>
                                    <ion-icon name="bookmark-outline" className="text-[#888] text-[1.3em] cursor-pointer hover:text-[#7ba8f0]"></ion-icon>
                                    <ion-icon name="person-add-outline" className="text-[#888] text-[1.3em] cursor-pointer hover:text-[#7ba8f0]"></ion-icon>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="topPicks relative w-[30%] h-full bg-[#10141E] px-2 box-border flex flex-col">
                    <p className="picksHeader text-[#7ba8f0] text-[1.2em] font-bold mt-10">Top Developer Picks</p>
                    <div className="topPicksContainer relative w-full max-h-[70%] overflow-y-auto flex-col items-center box-border flex-grow">
                        <div className="pickCard flex-shrink-0 relative flex flex-col w-full h-[150px] bg-[#1D202A] rounded-[8px] mx-auto p-5 box-border mt-3">
                            <AuthorAttribution
                              org={{ name: 'Elixpo Organization' }}
                              authors={[{ name: 'John Doe' }]}
                              size="sm"
                            />
                            <div className="contentInfo flex flex-row w-full gap-2">
                                <div className="contentTitle flex flex-col gap-1 w-[75%] box-border">
                                    <p className="contentText text-[#fff] text-[1.2em] font-bold">Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
                                </div>
                            </div>
                            <div className="postAttributes w-full flex flex-row mt-2 gap-5 justify-between">
                                <p className="date text-[#888] text-[1em]">Aug 10</p>
                            </div>
                        </div>

                        <div className="pickCard flex-shrink-0 relative flex flex-col w-full h-[150px] bg-[#1D202A] rounded-[8px] mx-auto p-5 box-border mt-3">
                            <AuthorAttribution
                              org={{ name: 'Elixpo Organization' }}
                              authors={[{ name: 'John Doe' }, { name: 'Jane Smith' }]}
                              size="sm"
                            />
                            <div className="contentInfo flex flex-row w-full gap-2">
                                <div className="contentTitle flex flex-col gap-1 w-[75%] box-border">
                                    <p className="contentText text-[#fff] text-[1.2em] font-bold">Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
                                </div>
                            </div>
                            <div className="postAttributes w-full flex flex-row mt-2 gap-5 justify-between">
                                <p className="date text-[#888] text-[1em]">Aug 10</p>
                            </div>
                        </div>

                        <div className="pickCard flex-shrink-0 relative flex flex-col w-full h-[150px] bg-[#1D202A] rounded-[8px] mx-auto p-5 box-border mt-3">
                            <AuthorAttribution
                              org={{ name: 'Elixpo Organization' }}
                              authors={[{ name: 'John Doe' }]}
                              size="sm"
                            />
                            <div className="contentInfo flex flex-row w-full gap-2">
                                <div className="contentTitle flex flex-col gap-1 w-[75%] box-border">
                                    <p className="contentText text-[#fff] text-[1.2em] font-bold">Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
                                </div>
                            </div>
                            <div className="postAttributes w-full flex flex-row mt-2 gap-5 justify-between">
                                <p className="date text-[#888] text-[1em]">Aug 10</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
