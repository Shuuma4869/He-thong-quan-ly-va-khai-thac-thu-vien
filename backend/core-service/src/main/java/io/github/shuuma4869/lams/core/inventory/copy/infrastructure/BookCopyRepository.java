package io.github.shuuma4869.lams.core.inventory.copy.infrastructure;

import io.github.shuuma4869.lams.core.inventory.copy.domain.BookCopy;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class BookCopyRepository {
    public record CopyPage(List<BookCopy> items,long totalElements){}
    private static final String SELECT="SELECT c.id,c.edition_id,b.title,e.isbn13,c.shelf_id,s.branch_id,s.code AS shelf_code,"
            +"c.barcode,c.status,c.version FROM book_copies c JOIN editions e ON e.id=c.edition_id "
            +"JOIN books b ON b.id=e.book_id JOIN shelves s ON s.id=c.shelf_id ";
    private final JdbcTemplate jdbc;
    public BookCopyRepository(JdbcTemplate jdbc){this.jdbc=jdbc;}
    public void create(BookCopy c){jdbc.update("INSERT INTO book_copies(id,edition_id,barcode,shelf_id,status,version) VALUES (?,?,?,?,?,0)",c.id(),c.editionId(),c.barcode(),c.shelfId(),"IN_PROCESS");}
    public Optional<BookCopy> find(UUID id){return jdbc.query(SELECT+"WHERE c.id=?",(r,n)->map(r),id).stream().findFirst();}
    public Optional<BookCopy> findBarcode(String barcode){return jdbc.query(SELECT+"WHERE c.barcode=?",(r,n)->map(r),barcode).stream().findFirst();}
    public CopyPage list(UUID editionId,UUID shelfId,String status,int page,int size){
        var clauses=new ArrayList<String>();var args=new ArrayList<Object>();
        if(editionId!=null){clauses.add("c.edition_id=?");args.add(editionId);}if(shelfId!=null){clauses.add("c.shelf_id=?");args.add(shelfId);}if(status!=null){clauses.add("c.status=?");args.add(status);}
        String where=clauses.isEmpty()?"":" WHERE "+String.join(" AND ",clauses);
        Long total=jdbc.queryForObject("SELECT count(*) FROM book_copies c"+where,Long.class,args.toArray());
        args.add(size);args.add((long)page*size);
        var rows=jdbc.query(SELECT+where+" ORDER BY c.barcode,c.id LIMIT ? OFFSET ?",(r,n)->map(r),args.toArray());
        return new CopyPage(rows,total==null?0:total);
    }
    public boolean update(BookCopy c,long expectedVersion){return jdbc.update("UPDATE book_copies SET edition_id=?,barcode=?,shelf_id=?,version=version+1 WHERE id=? AND version=?",
            c.editionId(),c.barcode(),c.shelfId(),c.id(),expectedVersion)==1;}
    private static BookCopy map(java.sql.ResultSet r)throws java.sql.SQLException{return new BookCopy(r.getObject("id",UUID.class),r.getObject("edition_id",UUID.class),r.getString("title"),r.getString("isbn13"),r.getObject("shelf_id",UUID.class),r.getObject("branch_id",UUID.class),r.getString("shelf_code"),r.getString("barcode"),r.getString("status"),r.getLong("version"));}
}
