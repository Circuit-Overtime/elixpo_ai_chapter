import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";

export default function PrivacyPolicy() {
  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 font-[family-name:var(--font-parkinsans)] flex flex-col">
      <Navbar />
      
      <div className="flex-grow pt-32 pb-24 px-6 max-w-4xl mx-auto w-full">
        <h1 className="text-4xl md:text-5xl font-black mb-8 text-neutral-900 dark:text-white">Privacy Policy</h1>
        
        <div className="space-y-8 text-neutral-600 dark:text-neutral-300 leading-relaxed">
          <section>
            <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-4">1. Introduction</h2>
            <p>
              Welcome to Elixpo Chat. We are deeply committed to protecting your personal information and your right to privacy. 
              This Privacy Policy applies to all information collected through our application, website, and related services.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-4">2. Information We Collect</h2>
            <p>
              We collect personal information that you voluntarily provide to us when you register on the application. 
              This includes your name, email address, and minimal demographic data. All AI interactions, voice transcripts, 
              and artifact data generated through Elixpo Chat are strictly managed to improve your specific session context.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-4">3. Chat Data Optimization & Privacy</h2>
            <p>
              Your chat sessions are fully under your control. By clicking the delete icon within a session, the chat 
              is permanently purged from our primary proxy servers and database. We implement modern virtualization 
              and client-side React optimizations to ensure your data stays secure locally and parses quickly.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-4">4. Sharing Your Information</h2>
            <p>
              We only share information with your consent, to comply with Google / Meta production level security laws, 
              to provide you with services, to protect your rights, or to fulfill business obligations natively.
            </p>
          </section>
          
          <section>
            <p className="text-sm text-neutral-400 mt-12 pt-8 border-t border-neutral-200 dark:border-neutral-800">
              Last Updated: April 2026
            </p>
          </section>
        </div>
      </div>

      <Footer />
    </main>
  );
}
