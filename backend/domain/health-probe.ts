// Esta interfaz pequeña permite comprobar el endpoint sin usar una base real.
// La prueba integral con PostgreSQL se añadirá junto con las migraciones.
export interface HealthProbe {
  readServerTime: () => Promise<Date>;
}
