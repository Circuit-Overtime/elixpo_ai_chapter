"use client";
import { useEffect, useState } from "react";

export default function NotificationPage() {
  const [prefs, setPrefs] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const loadPrefs = async () => {
      try {
        const res = await fetch("/api/settings/notifications");
        const data = await res.json();
        setPrefs(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadPrefs();
  }, []);

  if (loading || !prefs) {
    return <div>Loading...</div>;
  }
  const settings = [
    {
      key: "follow_enabled",
      title: "Follow Notifications",
      desc: "Get notified when someone follows you",
    },
    {
      key: "comment_enabled",
      title: "Comment Notifications",
      desc: "Get notified when someone comments on your content",
    },
    {
      key: "like_enabled",
      title: "Like Notifications",
      desc: "Get notified when someone likes your content",
    },
    {
      key: "mention_enabled",
      title: "Mention Notifications",
      desc: "Get notified when someone mentions you",
    },
    {
      key: "org_invite_enabled",
      title: "Organization Invites",
      desc: "Get notified when invited to an organization",
    },
    {
      key: "blog_invite_enabled",
      title: "Blog Collaboration Invites",
      desc: "Get notified when invited to collaborate on a blog",
    },
    {
      key: "blog_published_enabled",
      title: "Blog Published",
      desc: "Get notified when a blog is published",
    },
    {
      key: "email_enabled",
      title: "Email Notifications",
      desc: "Receive notification emails",
    },
  ];

  const updatePreference = async (key, value) => {
    const updated = {
      ...prefs,
      [key]: value ? 1 : 0,
    };

    setPrefs(updated);

    try {
      await fetch("/api/settings/notifications", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updated),
      });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="container absolute flex flex-col h-full max-w-[2560px] bg-[#030712] box-border">
      <section className="w-full h-[60px]">
        <div className="relative top-0 left-0 w-full h-[60px] border-b-2 border-[#1D202A] flex items-center bg-[#030712] z-[1000]">
          <div className="absolute left-[3%] h-10 w-10 rounded-full bg-[url('/logo.png')] bg-cover"></div>
          <p className="absolute left-[5%] text-3xl font-bold font-[Kanit,serif] text-[var(--text-primary)] cursor-pointer">
            LixBlogs
          </p>
          <div className="absolute left-[80%] text-[var(--text-primary)] text-[1.3em] cursor-pointer px-2.5 py-1.5 bg-[#10141E] border border-[#7ba8f0] rounded-[15px] flex items-center">
            <ion-icon
              name="pencil"
              className="text-[0.8em] mr-1 text-[#7ba8f0]"
            ></ion-icon>
            Write
          </div>
          <div className="absolute left-[88%] text-[var(--text-primary)] text-[1.3em] cursor-pointer">
            Sign-In
          </div>
          <ion-icon
            name="logo-github"
            className="githubLogo absolute left-[95%] text-[#888] text-2xl"
          ></ion-icon>
        </div>
      </section>
      <div className="settingsSection flex flex-row h-full w-full box-border">
        <section className="relative flex flex-row h-full w-full box-border border-t-2 border-[#1D202A]">
          <div className="profileInformation w-[20%] h-full bg-[#10141E] px-5 box-border flex flex-col items-center">
            <div className="profileControlButtons flex-col w-full mt-5 py-10 box-border">
              <div className="controlButton selected relative h-[40px] w-full bg-[#1D202A] rounded-[8px] flex flex-row mb-5 px-2 box-border cursor-pointer gap-[10px] items-center text-[1.3em] hover:bg-[#313647] hover:text-[var(--text-primary)] transition-all duration-300">
                <ion-icon
                  name="home-outline"
                  className="text-[#7ba8f0] text-[0.9em]"
                ></ion-icon>
                <p className="text-[#7ba8f0] text-[0.9em]">Home</p>
              </div>
              <div className="controlButton relative h-[40px] w-full bg-[#1D202A] rounded-[8px] flex flex-row mb-5 px-2 cursor-pointer gap-[10px] items-center text-[1.3em] hover:bg-[#313647] hover:text-[var(--text-primary)] transition-all duration-300">
                <ion-icon
                  name="bookmark-outline"
                  className="text-[#7ba8f0] text-[0.9em]"
                ></ion-icon>
                <p className="text-[#7ba8f0] text-[0.9em]">Library</p>
              </div>
              <div className="controlButton relative h-[40px] w-full bg-[#1D202A] rounded-[8px] flex flex-row mb-15 px-2 cursor-pointer gap-[10px] items-center text-[1.3em] hover:bg-[#313647] hover:text-[var(--text-primary)] transition-all duration-300">
                <ion-icon
                  name="person-outline"
                  className="text-[#7ba8f0] text-[0.9em]"
                ></ion-icon>
                <p className="text-[#7ba8f0] text-[0.9em]">Profile</p>
              </div>
              <div className="controlButton relative h-[40px] w-full bg-[#1D202A] rounded-[8px] flex flex-row mt-20 mb-5 px-2 cursor-pointer gap-[10px] items-center text-[1.3em] hover:bg-[#313647] hover:text-[var(--text-primary)] transition-all duration-300">
                <ion-icon
                  name="book-outline"
                  className="text-[#7ba8f0] text-[0.9em]"
                ></ion-icon>
                <p className="text-[#7ba8f0] text-[0.9em]">Stories</p>
              </div>
              <div className="controlButton relative h-[40px] w-full bg-[#1D202A] rounded-[8px] flex flex-row mb-5 px-2 cursor-pointer gap-[10px] items-center text-[1.3em] hover:bg-[#313647] hover:text-[var(--text-primary)] transition-all duration-300">
                <ion-icon
                  name="stats-chart-outline"
                  className="text-[#7ba8f0] text-[0.9em]"
                ></ion-icon>
                <p className="text-[#7ba8f0] text-[0.9em]">Stats</p>
              </div>
              <div className="userInfo flex items-center gap-2 w-full h-[50px] px-3 rounded-[12px] bg-[#10141E] shadow-[6px_6px_12px_#0b0e16,-6px_-6px_12px_#171c28]">
                <div className="userLogo flex-shrink-0 h-[35px] w-[35px] rounded-full bg-[#888] shadow-[inset_3px_3px_6px_#777,inset_-3px_-3px_6px_#999]"></div>
                <span className="text-[var(--text-primary)] text-lg font-medium cursor-pointer userOrganization truncate">
                  Ayushman Bhattacharya
                </span>
              </div>
            </div>
          </div>

          <div className="settingsControl w-[80%] h-full max-h-[calc(100vh-80px)] overflow-y-auto bg-[#030712] px-10 box-border flex flex-col items-start">
            <div className="settingsHeader w-full h-[30%] flex flex-row items-center">
              <h1 className="text-[var(--text-primary)] text-[4em] my-auto font-bold">
                Settings
              </h1>
            </div>

            <div className="settingsNav flex flex-row w-full h-[10%] items-center justify-left gap-10 mt-2 border-b-2 border-[#1D202A]">
              <p className="settingsNavItem text-[#888] text-lg cursor-pointer select-none">
                Account
              </p>
              <p className="settingsNavItem text-[#888] text-lg cursor-pointer select-none">
                Publisher
              </p>
              <p className="settingsNavItem text-[#888] text-lg cursor-pointer selected underline select-none">
                Notification
              </p>
              <p className="settingsNavItem text-[#888] text-lg cursor-pointer select-none">
                Organisation
              </p>
            </div>

            <div className="publisherSettings flex flex-col w-full mt-10 gap-5">
              {settings.map((setting, idx) => (
                <div
                  key={setting.key}
                  className="settingBox flex flex-row items-center justify-between w-full"
                >
                  <div className="flex flex-col">
                    <p className="text-[var(--text-primary)] text-lg select-none">
                      {setting.title}
                    </p>
                    <p className="text-[#888] text-[1em] select-none">
                      {setting.desc}
                    </p>
                  </div>
                  <div className="freq flex flex-row gap-5">
                    <button
                      onClick={() =>
                        updatePreference(
                          setting.key,
                          !Boolean(prefs[setting.key]),
                        )
                      }
                      className={`px-4 py-2 rounded-lg transition-all ${
                        prefs[setting.key]
                          ? "bg-[#7ba8f0] text-white"
                          : "bg-[#1D202A] text-[#888]"
                      }`}
                    >
                      {prefs[setting.key] ? "Enabled" : "Disabled"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
