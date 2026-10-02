type Props = {
  className?: string;
};

/** Skeleton con la forma final del componente. Nunca un spinner
 *  centrado a pantalla completa. (Sección 5 del doc de diseño.) */
export function Skeleton({ className = "" }: Props) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-gray-200 ${className}`}
      aria-busy="true"
      aria-label="Cargando..."
    />
  );
}
