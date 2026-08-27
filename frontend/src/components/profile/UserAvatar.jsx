const getInitials = (name) => {
  const parts = String(name || "Farmer")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return "F";
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
};

export default function UserAvatar({ className = "h-12 w-12", imageUrl, name }) {
  const sharedClassName = `${className} shrink-0 rounded-full object-cover`;

  if (imageUrl) {
    return <img src={imageUrl} alt={`${name || "Farmer"} profile`} className={sharedClassName} />;
  }

  return (
    <span
      aria-label={`${name || "Farmer"} profile initials`}
      className={`${sharedClassName} inline-flex items-center justify-center bg-gradient-to-br from-emerald-600 via-lime-500 to-amber-400 font-display font-bold text-slate-950`}
    >
      {getInitials(name)}
    </span>
  );
}
