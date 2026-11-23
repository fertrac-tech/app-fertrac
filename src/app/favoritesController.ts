import * as fav from '@/domain/favorites';
import type { FavoritesState } from '@/domain/favorites';
import type { Analytics, FavoritesRepository } from '@/ports';

type Listener = () => void;

const NO_ANALYTICS: Pick<Analytics, 'track'> = { track: () => undefined };

/** Estado de favoritos del usuario activo: aplica reglas de dominio y persiste cada cambio. */
export class FavoritesController {
  private state: FavoritesState = fav.emptyFavorites();
  private userKey: string | null = null;
  private readonly listeners = new Set<Listener>();

  constructor(
    private readonly repository: FavoritesRepository,
    private readonly newId: () => string = () => crypto.randomUUID(),
    private readonly analytics: Pick<Analytics, 'track'> = NO_ANALYTICS,
  ) {}

  getState = (): FavoritesState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Carga los favoritos del usuario; con `null` (sin sesión) queda vacío. */
  async load(userKey: string | null): Promise<void> {
    this.userKey = userKey;
    const loaded = userKey ? await this.repository.load(userKey).catch(() => fav.emptyFavorites()) : fav.emptyFavorites();
    if (this.userKey === userKey) this.set(loaded);
  }

  toggle = (ref: string) => {
    const wasFavorite = fav.isFavorite(this.state, ref);
    if (this.apply((s) => fav.toggleFavorite(s, ref))) this.trackFavorite(ref, !wasFavorite);
  };
  add = (ref: string) => {
    if (this.apply((s) => fav.addFavorite(s, ref))) this.trackFavorite(ref, true);
  };
  remove = (ref: string) => {
    if (this.apply((s) => fav.removeFavorite(s, ref))) this.trackFavorite(ref, false);
  };
  renameList = (id: string, name: string) => this.apply((s) => fav.renameList(s, id, name));
  deleteList = (id: string) => this.apply((s) => fav.deleteList(s, id));

  /** Crea una lista y devuelve su id. Lanza FavoritesError si el nombre no es válido. */
  createList(name: string): string {
    const id = this.newId();
    if (this.apply((s) => fav.createList(s, name, id))) this.analytics.track({ name: 'lista_creada' });
    return id;
  }

  /** Guarda alias y listas de un favorito en una sola operación (hoja "Editar favorito"). */
  saveFavorite(ref: string, alias: string, listIds: readonly string[]): void {
    const wasFavorite = fav.isFavorite(this.state, ref);
    if (!this.apply((s) => fav.setFavoriteLists(fav.setAlias(fav.addFavorite(s, ref), ref, alias), ref, listIds))) return;
    if (!wasFavorite) this.trackFavorite(ref, true);
    this.analytics.track({ name: 'favorito_editado', item_id: ref, con_alias: alias.trim().length > 0, listas: listIds.length });
  }

  private trackFavorite(ref: string, added: boolean): void {
    this.analytics.track(added ? { name: 'add_to_wishlist', items: [{ item_id: ref }] } : { name: 'favorito_quitado', item_id: ref });
  }

  /** Aplica el cambio; devuelve false si no cambió nada (no se mide ni se guarda). */
  private apply(change: (state: FavoritesState) => FavoritesState): boolean {
    const next = change(this.state);
    if (next === this.state) return false;
    this.set(next);
    if (this.userKey) void this.repository.save(this.userKey, next).catch(() => undefined);
    return true;
  }

  private set(state: FavoritesState): void {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
}
