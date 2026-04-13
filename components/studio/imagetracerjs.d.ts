declare module "imagetracerjs" {
  interface ImageTracer {
    imagedataToSVG(imgd: ImageData, options?: string | Record<string, unknown>): string;
    imageToSVG(url: string, callback: (svg: string) => void, options?: string | Record<string, unknown>): void;
  }
  const tracer: ImageTracer;
  export default tracer;
}
