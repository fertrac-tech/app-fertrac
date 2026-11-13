import type { Product } from '@/domain/product';
import { ApiError, type CatalogSource } from '@/ports';
import type { AppsScriptClient } from './client';
import { rowsToProducts, type CatalogRow } from './mapper';

interface CatalogResponse {
  data?: CatalogRow[];
}
interface PhotosResponse {
  ok?: boolean;
  fotos?: Record<string, string>;
}

/** Catálogo completo + mapa de fotos desde Apps Script. Las fotos nunca bloquean la carga. */
export class AppsScriptCatalogSource implements CatalogSource {
  constructor(private readonly client: AppsScriptClient) {}

  async fetchAll(): Promise<Product[]> {
    const [catalog, photos] = await Promise.all([
      this.client.get<CatalogResponse>(),
      this.client.get<PhotosResponse>({ fotos: '1' }).catch(() => ({}) as PhotosResponse),
    ]);
    if (!Array.isArray(catalog.data)) throw new ApiError('respuesta_invalida');
    return rowsToProducts(catalog.data, photos.fotos ?? {});
  }
}
