import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class LookupRequest {
  @IsString()
  @Matches(/^[0-9]{13}$/)
  isbn13: string;
}

export class HistoryQuery {
  @Type(() => Number) @IsInt() @Min(0) @Max(1000000)
  page = 0;

  @Type(() => Number) @IsInt() @Min(1) @Max(100)
  size = 20;

  @IsOptional() @IsString() @Matches(/^[0-9]{1,13}$/)
  isbn?: string;

  @IsIn(['newest', 'oldest'])
  sort: 'newest' | 'oldest' = 'newest';
}
