import type { Category } from '../types';

export function visibleHelpCategories(categories: Category[] = []): Category[] {
  return categories
    .filter(category => {
      const name = category.nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
      return name !== 'intercambio' && name !== 'un favor';
    })
    .map(category => category.nombre.toLocaleLowerCase('es') === 'préstamo'
      ? { ...category, nombre: 'Préstamo de objetos' }
      : category);
}
