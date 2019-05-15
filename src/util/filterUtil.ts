import deburr from 'lodash/deburr';

export function filter(filterText: string, items: any[], field?: string) {
  filterText = filterText ? deburr(filterText.trim()).toLowerCase() : ''
  const pieces = filterText.split(" or ").filter(piece => piece.length > 0)

  const filteredItems: Set<any> = new Set
  pieces.forEach(piece => {
    const words = piece.split(" ").filter(word => word.length > 0)
    let matches = items
    let negated = false
    words.forEach(word => {
      const isNot = word === "!"
      negated = negated || isNot
      if(!isNot) {
        matches = matches.filter(item => {
          if(item instanceof Array) {
            let isExcluded = false
            const matchedItems = item.map(item => {
              const isMatched = (field ? item[field] : item).toLowerCase().includes(word)
              isExcluded = isExcluded || negated && isMatched
              return negated ? !isMatched : isMatched
            })
            return isExcluded ? false : matchedItems.reduce((r1,r2) => r1||r2)
          } else {
            const isMatched = (field ? item[field] : item).toLowerCase().includes(word)
            return negated ? !isMatched : isMatched
          }
        })
      }
    })
    matches.forEach(item => filteredItems.add(item))
  })
  return Array.from(filteredItems)
}

class FilterGroup {
  positiveFilters: string[] = []
  negativeFilters: string[] = []

  private matchItemToFilters(filters: string[], item: any, field?: string) {
    if(item instanceof Array) {
      const matchedFilters: Set<string> = new Set
      item.forEach(i => {
        const text = (field ? item[field] : item).toLowerCase()
        filters.filter(filter => text.includes(filter)).forEach(filter => matchedFilters.add(filter))
      })
      return matchedFilters.size === filters.length
    } else {
      const text = (field ? item[field] : item).toLowerCase()
      return filters.filter(word => text.includes(word)).length === filters.length
    }
  }

  matchItem(item: any, field?: string) {
    return (this.negativeFilters.length === 0 || !this.matchItemToFilters(this.negativeFilters, item, field))
            && (this.positiveFilters.length === 0 || this.matchItemToFilters(this.positiveFilters, item, field))
  }

  filter(items: any[], field?: string) {
    const nonNegativeItems = items.filter(item => !this.matchItemToFilters(this.negativeFilters, item, field))
    return nonNegativeItems.filter(item => this.matchItemToFilters(this.positiveFilters, item, field))
  }
}

export class Filter {
  filterGroups: FilterGroup[] = []

  filter(items: any[], field?: string) {
    return this.filterGroups.length === 0 ? items :
          items.filter(item => this.filterGroups.filter(filterGroup => filterGroup.matchItem(item, field)).length > 0)
  }
}

export default class FilterUtil {

  static createFilter(...filters) {
    const filter: Filter = new Filter
    filters.forEach(filterText => {
      filterText = filterText ? deburr(filterText.trim()).toLowerCase() : ''
      filterText.split(" or ").filter(piece => piece.length > 0)
      .forEach(f => {
        const words = f.split(" ").filter(word => word.length > 0)
        const filterGroup = new FilterGroup
        let negated = false
        words.forEach(word => {
          const isNot = word === "!"
          negated = negated || isNot
          if(!isNot) {
            negated ? filterGroup.negativeFilters.push(word) : filterGroup.positiveFilters.push(word)
          }
        })
        filter.filterGroups.push(filterGroup)
      })
    })
    return filter
  }

  static filter(filterText: string, items: any[], field?: string) {
    return this.createFilter(filterText).filter(items, field)
  }
}