import Pocketbase from 'pocketbase';

// Por defecto, mismo origen: PocketBase sirve tanto la API como el frontend (pb_public).
export const POCKETBASE_API_URL = import.meta.env.VITE_PB_URL || '/';

const pocketbaseClient = new Pocketbase(POCKETBASE_API_URL);

export default pocketbaseClient;

export { pocketbaseClient };
