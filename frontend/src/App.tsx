import { HeroScrollDemo } from "./components/ui/hero-scroll-demo";

function App() {
  return (
    <div className="relative min-h-screen w-full overflow-x-hidden selection:bg-white/20 selection:text-white">
      
      {/* Background Video */}
      <div className="absolute inset-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4"
        />
        {/* Subtle dark overlay to ensure readability of typography */}
        <div className="absolute inset-0 bg-background/25 backdrop-brightness-[0.85]" />
      </div>

      {/* Navigation Bar */}
      <nav className="relative z-10 max-w-7xl mx-auto px-8 py-6 flex flex-row items-center justify-between">
        
        {/* Logo */}
        <a href="#" className="text-3xl tracking-tight text-white focus:outline-none flex items-center gap-2" style={{ fontFamily: "'Instrument Serif', serif" }}>
          Aditya Portal<span className="text-xs font-sans font-medium bg-white/10 px-2 py-0.5 rounded-full ml-1 text-white/85">v1.0</span>
        </a>

        {/* Links */}
        <div className="hidden md:flex flex-row items-center gap-10">
          <a href="#" className="text-sm font-medium text-white transition-colors duration-200">
            Home
          </a>
          <a href="/dashboard/" className="text-sm font-medium text-muted-foreground hover:text-white transition-colors duration-200">
            Faculty Dashboard
          </a>
          <a href="https://www.aditya.ac.in" target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-muted-foreground hover:text-white transition-colors duration-200">
            Aditya University
          </a>
        </div>

        {/* CTA Button */}
        <div>
          <a href="/dashboard/" className="liquid-glass rounded-full px-6 py-2.5 text-sm font-medium text-white cursor-pointer hover:scale-[1.03] transition-all duration-300 focus:outline-none inline-block text-center">
            Enter Dashboard
          </a>
        </div>
      </nav>

      {/* Hero Section Container */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-32 pb-20 flex flex-col items-center justify-center text-center">
        
        {/* Cinematic Heading */}
        <h1 
          className="text-5xl sm:text-7xl md:text-8xl lg:text-[7.5rem] leading-[0.95] tracking-[-2.46px] text-white max-w-6xl font-normal animate-fade-rise"
          style={{ fontFamily: "'Instrument Serif', serif" }}
        >
          AI-Powered <em className="not-italic text-muted-foreground italic">Attendance</em> Bot <br />
          <em className="not-italic text-muted-foreground italic">for Aditya University.</em>
        </h1>

        {/* Subtext */}
        <p className="text-muted-foreground text-base sm:text-lg md:text-xl max-w-2xl mt-8 leading-relaxed font-sans font-light animate-fade-rise-delay">
          Exposing live statistics, subject-wise analytics, and direct WhatsApp chatbot notifications. A production-grade portal designed for HODs, Faculty, and Students of Aditya University.
        </p>

        {/* CTA Button */}
        <div>
          <a href="/dashboard/" className="liquid-glass rounded-full px-14 py-5 text-base font-semibold text-white mt-12 cursor-pointer hover:scale-[1.03] transition-all duration-300 focus:outline-none animate-fade-rise-delay-2 shadow-lg shadow-black/20 inline-block text-center">
            Enter Dashboard
          </a>
        </div>
        
      </div>

      {/* Grid Scrolling Animation Section */}
      <div className="relative z-10 w-full bg-background/50 backdrop-blur-md border-t border-white/5">
        <div className="max-w-7xl mx-auto">
          <HeroScrollDemo />
        </div>
      </div>

      {/* Footer Details */}
      <footer className="relative z-10 w-full py-10 bg-background/90 text-center text-xs text-muted-foreground font-sans tracking-widest uppercase border-t border-white/5">
        <p>© 2026 Aditya University Attendance Bot. All Rights Reserved.</p>
      </footer>

    </div>
  );
}

export default App;
