import { Film } from "lucide-react";

export function MoviePoster({
  src,
  alt,
  className = "",
}: {
  src: string | null;
  alt: string;
  className?: string;
}) {
  if (!src) {
    return (
      <div
        className={`flex items-center justify-center bg-secondary text-muted-foreground ${className}`}
        aria-label={alt}
      >
        <Film className="size-6" />
      </div>
    );
  }
  return <img src={src} alt={alt} loading="lazy" className={`object-cover ${className}`} />;
}
