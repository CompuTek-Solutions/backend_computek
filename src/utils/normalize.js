/**
 * Normalize text by removing accents
 * @param {string} str - The string to normalize
 * @returns {string} - Normalized string
 */
export const normalizeAccents = (str) => {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
};

/**
 * Normalize search term for accent-insensitive search
 * @param {string} searchTerm - The search term
 * @returns {string} - Normalized search term for SQL LIKE clause
 */
export const normalizeSearchTerm = (searchTerm) => {
  if (!searchTerm) return '';
  // Remove accents using NFD normalization
  const normalized = searchTerm.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Return with wildcards for LIKE search
  return `%${normalized}%`;
};
