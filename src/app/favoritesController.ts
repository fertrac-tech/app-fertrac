import * as fav from '@/domain/favorites';
import type { FavoritesState } from '@/domain/favorites';
import type { FavoritesRepository } from '@/ports';

type Listener = () => void;

/** Estado de favoritos del usuario activo: aplica reglas de dominio y persiste cada cambio. */
export class FavoritesController {
  private state: FavoritesState = fav.emptyFavorites();
  private userKey: string | null = null;
  private readonly listeners = new Set<Listener>();

  constructor(
    private readonly repository: FavoritesRepository,
    private readonly newId: () => string = () => crypto.randomUUID(),
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

  toggle = (ref: string) => this.apply((s) => fav.toggleFavorite(s, ref));
  add = (ref: string) => this.apply((s) => fav.addFavorite(s, ref));
  remove = (ref: string) => this.apply((s) => fav.removeFavorite(s, ref));
  renameList = (id: string, name: string) => this.apply((s) => fav.renameList(s, id, name));
  deleteList = (id: string) => this.apply((s) => fav.deleteList(s, id));

  /** Crea una lista y devuelve su id. Lanza FavoritesError si el nombre no es válido. */
  createList(name: string): string {
    const id = this.newId();
    this.apply((s) => fav.createList(s, name, id));
    return id;
  }

  /** Guarda alias y listas de un favorito en una sola operación (hoja "Editar favorito"). */
  saveFavorite(ref: string, alias: string, listIds: readonly string[]): void {
    this.apply((s) => fav.setFavoriteLists(fav.setAlias(fav.addFavorite(s, ref), ref, alias), ref, listIds));
  }

  private apply(change: (state: FavoritesState) => FavoritesState): void {
    const next = change(this.state);
    if (next === this.state) return;
    this.set(next);
    if (this.userKey) void this.repository.save(this.userKey, next).catch(() => undefined);
  }

  private set(state: FavoritesState): void {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
}
