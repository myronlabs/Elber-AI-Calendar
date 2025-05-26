import React from 'react';

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (_page: number) => void;
  isLoading?: boolean;
  className?: string;
}

const PaginationControls: React.FC<PaginationControlsProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  isLoading = false,
  className = ''
}) => {
  if (totalPages <= 1) return null;

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages && page !== currentPage && !isLoading) {
      onPageChange(page);
    }
  };

  const renderPageNumbers = () => {
    const pageNeighbours = 1;
    const pages: (number | string)[] = [];

    const range = (start: number, end: number) => {
      return Array.from({ length: (end - start) + 1 }, (_, i) => i + start);
    };

    if (totalPages <= 7) {
      pages.push(...range(1, totalPages));
    } else {
      const leftSpill = currentPage - pageNeighbours;
      const rightSpill = currentPage + pageNeighbours;

      pages.push(1);

      if (leftSpill > 2) {
        pages.push('...');
      }
      
      const middleStart = Math.max(2, leftSpill);
      const middleEnd = Math.min(totalPages - 1, rightSpill);

      pages.push(...range(middleStart, middleEnd));

      if (rightSpill < totalPages - 1) {
        pages.push('...');
      }

      if (totalPages > 1) {
        pages.push(totalPages);
      }
    }
    
    return pages.map((page, index) => {
      if (typeof page === 'string') {
        return <span key={`ellipsis-${index}`} className="pagination-ellipsis">{page}</span>;
      }
      return (
        <button
          key={page}
          onClick={() => handlePageChange(page)}
          disabled={page === currentPage || isLoading}
          className={`pagination-button page-number ${page === currentPage ? 'active' : ''}`}
          aria-label={`Go to page ${page}`}
          aria-current={page === currentPage ? 'page' : undefined}
        >
          {page}
        </button>
      );
    });
  };

  return (
    <div className={`pagination-controls ${className}`}>
      <button 
        onClick={() => handlePageChange(currentPage - 1)} 
        disabled={currentPage === 1 || isLoading}
        className="pagination-button prev-button"
        aria-label="Go to previous page"
      >
        Previous
      </button>
      
      {renderPageNumbers()}

      <button 
        onClick={() => handlePageChange(currentPage + 1)} 
        disabled={currentPage === totalPages || isLoading}
        className="pagination-button next-button"
        aria-label="Go to next page"
      >
        Next
      </button>
      
      <span className="page-info" role="status" aria-live="polite">
        Page {currentPage} of {totalPages}
      </span>
    </div>
  );
};

export default PaginationControls;