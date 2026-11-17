import type { Category } from '../types';

export function visibleHelpCategories(categories: Category[] = []): Category[] {
  return categories
    .filter(category => category.nombre.toLocaleLowerCase('es') !== 'intercambio')
    .map(category => category.nombre.toLocaleLowerCase('es') === 'préstamo'
      ? { ...category, nombre: 'Préstamo de objetos' }
      : category);
}