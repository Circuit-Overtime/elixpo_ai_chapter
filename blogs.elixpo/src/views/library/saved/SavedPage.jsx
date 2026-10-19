'use client';
import '../../../styles/library/library.css';

export default function SavedPage() {

  const handleNavigation = (page) => {
    // Handle navigation logic
    console.log('Navigate to:', page);
  };

  return (
    <div className="container absolute flex flex-col h-full max-w-[2560px] bg-[#030712] box-border">
      {/* Header Section */}
      <section className="w-full h-[60px]">
        <div className="relative top-0 left-0 w-full h-[60px] border-b-2 border-[#1D202A] flex items-center bg-[#030712] z-[1000]">
          <div className="absolute left-[3%] h-10 w-10 rounded-full bg-cover" style={{backgroundImage: "url('/logo.png')"}}></div>
          <p className="absolute left-[5%] text-3xl font-bold font-[Kanit,serif] text-[var(--text-primary)] cursor-pointer">LixBlogs</p>
          <div className="absolute left-[80%] text-[var(--text-primary)] text-[1.3em] cursor-pointer px-2.5 py-1.5 bg-[#10141E] border border-[#7ba8f0] rounded-[15px] flex items-center">
            <ion-icon name="pencil" className="text-[0.8em] mr-1 text-[#7ba8f0]"></ion-icon>
            Write
          </div>
          <div className="absolute left-[88%] text-[var(--text-primary)] text-[1.3em] cursor-pointer">Sign-In</div>
          <ion-icon name="logo-github" className="githubLogo absolute left-[95%] text-[#888] text-2xl"></ion-icon>
        </div>
      </section>

      <div className="librarySection flex flex-row h-full w-full box-border">
        {/* Main Content Section */}
        <section className="relative flex flex-row h-full w-full box-border border-t-2 border-[#1D202A]">
          {/* Sidebar */}
          <div className="profileInformation w-[20%] h-full bg-[#10141E] px-5 box-border flex flex-col items-center">
            <div className="profileControlButtons flex-col w-full mt-5 py-10 box-border">
              {/* Navigation Buttons */}
              <div 
                className="controlButton relative h-[40px] w-full bg-[#1D202A] rounded-[8px] flex flex-row mb-5 px-2 box-border cursor-pointer gap-[10px] items-center text-[1.3em] hover:bg-[#313647] hover:text-[var(--text-primary)] transition-all duration-300"
                onClick={() => handleNavigation('home')}
              >
                <ion-icon name="home-outline" className="text-[#7ba8f0] text-[0.9em]"></ion-icon>
                <p className="text-[#7ba8f0] text-[0.9em]">Home</p>
              </div>

              <div 
                className="controlButton relative h-[40px] w-full bg-[#1D202A] rounded-[8px] flex flex-row mb-5 px-2 cursor-pointer gap-[10px] items-center text-[1.3em] hover:bg-[#313647] hover:text-[var(--text-primary)] transition-all duration-300"
                onClick={() => handleNavigation('library')}
              >
                <ion-icon name="bookmark-outline" className="text-[#7ba8f0] text-[0.9em]"></ion-icon>
                <p className="text-[#7ba8f0] text-[0.9em]">Library</p>
              </div>

              <div 
                className="controlButton relative h-[40px] w-full bg-[#1D202A] rounded-[8px] flex flex-row mb-15 px-2 cursor-pointer gap-[10px] items-center text-[1.3em] hover:bg-[#313647] hover:text-[var(--text-primary)] transition-all duration-300"
                onClick={() => handleNavigation('profile')}
              >
                <ion-icon name="person-outline" className="text-[#7ba8f0] text-[0.9em]"></ion-icon>
                <p className="text-[#7ba8f0] text-[0.9em]">Profile</p>
              </div>

              <div 
                className="controlButton relative h-[40px] w-full bg-[#1D202A] rounded-[8px] flex flex-row mt-20 mb-5 px-2 cursor-pointer gap-[10px] items-center text-[1.3em] hover:bg-[#313647] hover:text-[var(--text-primary)] transition-all duration-300"
                onClick={() => handleNavigation('stories')}
              >
                <ion-icon name="book-outline" className="text-[#7ba8f0] text-[0.9em]"></ion-icon>
                <p className="text-[#7ba8f0] text-[0.9em]">Stories</p>
              </div>

              <div 
                className="controlButton relative h-[40px] w-full bg-[#1D202A] rounded-[8px] flex flex-row mb-5 px-2 cursor-pointer gap-[10px] items-center text-[1.3em] hover:bg-[#313647] hover:text-[var(--text-primary)] transition-all duration-300"
                onClick={() => handleNavigation('library-chart')}
              >
                <ion-icon name="library-chart-outline" className="text-[#7ba8f0] text-[0.9em]"></ion-icon>
                <p className="text-[#7ba8f0] text-[0.9em]">library</p>
              </div>

              {/* User Info */}
              <div className="userInfo flex items-center gap-2 w-full h-[50px] px-3 rounded-[12px] bg-[#10141E] shadow-[6px_6px_12px_#0b0e16,-6px_-6px_12px_#171c28]">
                <div className="userLogo flex-shrink-0 h-[35px] w-[35px] rounded-full bg-[#888] shadow-[inset_3px_3px_6px_#777,inset_-3px_-3px_6px_#999]"></div>
                <span className="text-[var(--text-primary)] text-lg font-medium cursor-pointer userOrganization truncate">Ayushman Bhattacharya</span>
              </div>
            </div>
          </div>

          {/* Library Content Area */}
          <div className="libraryControl w-[80%] h-full max-h-[calc(100vh-80px)] overflow-y-auto bg-[#030712] px-10 box-border flex flex-col items-start">
            {/* Library Header */}
            <div className="libraryHeader w-full h-[30%] flex flex-row items-center">
              <h1 className="text-[var(--text-primary)] text-[4em] my-auto font-bold">Saved Collections</h1>
            </div>

            {/* Library Navigation */}
            <div className="libraryNav flex flex-row w-full h-[10%] items-center justify-left gap-10 mt-2 border-b-2 border-[#1D202A]">
              <p className="libraryNavItem text-[#888] text-lg cursor-pointer select-none">Collection</p>
              <p className="libraryNavItem text-[#7ba8f0] text-lg cursor-pointer selected underline select-none">Saved Collections</p>
              <p className="libraryNavItem text-[#888] text-lg cursor-pointer select-none">Read History</p>
            </div>

            {/* Library Overview */}
            <div className="libraryOverview flex flex-col w-full mt-10 gap-5">
              {/* Empty State Card */}
              <div className="relative flex items-center w-full h-[180px] bg-[#1e293b] rounded-xl overflow-hidden shadow-lg">
                <div className="flex flex-col justify-center h-full pl-10 w-2/3">
                  <h2 className="text-[var(--text-primary)] text-3xl font-bold mb-2">No saved collections yet</h2>
                  <p className="text-[#cbd5e1] text-lg">You haven't saved any collections. Explore and save your favorite collections to see them here.</p>
                </div>
                <div className="absolute right-0 top-0 h-full flex items-center pr-16">
                  <div className="relative flex items-center justify-center">
                    <span className="absolute w-[220px] h-[220px] bg-[#2563eb] opacity-60 rounded-full"></span>
                    <span className="absolute w-[140px] h-[140px] bg-[#60a5fa] opacity-80 rounded-full"></span>
                    <span className="relative flex items-center justify-center w-[90px] h-[90px] bg-white rounded-full z-10">
                      <ion-icon name="bookmark-outline" className="text-[#2563eb] text-4xl"></ion-icon>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
