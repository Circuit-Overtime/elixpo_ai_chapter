import BackgroundDecorations from './components/shared/BackgroundDecorations';
import Navbar from './components/Navbar/Navbar';
import Hero from './components/Hero/Hero';
import BoldStats from './components/BoldStats/BoldStats';
import ShowcaseStrip from './components/ShowcaseStrip/ShowcaseStrip';
import Features from './components/Features/Features';
import InfoSections from './components/InfoSections/InfoSections';
import CallToAction from './components/CallToAction/CallToAction';
import Footer from './components/Footer/Footer';

export default function Home() {
  return (
    <>
      <BackgroundDecorations />
      <Navbar />
      <main>
        <Hero />
        <BoldStats />
        <ShowcaseStrip />
        <Features />
        <InfoSections />
        <CallToAction />
      </main>
      <Footer />
    </>
  );
}
