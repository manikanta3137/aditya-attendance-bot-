import { ContainerScroll } from "./container-scroll-animation";

export function HeroScrollDemo() {
  return (
    <div className="flex flex-col overflow-hidden pb-[100px] pt-[100px] w-full">
      <ContainerScroll
        titleComponent={
          <div className="animate-fade-rise-delay-2 px-4">
            <h2 
              className="text-4xl sm:text-6xl md:text-7xl font-normal text-white tracking-tight leading-none mb-6"
              style={{ fontFamily: "'Instrument Serif', serif" }}
            >
              Discover the power of <br />
              <span className="text-5xl sm:text-8xl md:text-9xl text-muted-foreground italic mt-3 block">
                chatbot tracking.
              </span>
            </h2>
          </div>
        }
      >
        <img
          src="https://ui.aceternity.com/_next/image?url=%2Flinear.webp&w=3840&q=75"
          alt="Aditya HOD Control Dashboard Mockup"
          className="mx-auto rounded-2xl object-cover h-full w-full object-left-top select-none pointer-events-none"
          draggable={false}
        />
      </ContainerScroll>
    </div>
  );
}
