import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PaginationQueryDto } from './pagination-query.dto';

describe('PaginationQueryDto', () => {
  it('uses stable defaults for list APIs', async () => {
    const dto = plainToInstance(PaginationQueryDto, {});

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toMatchObject({
      page: 1,
      pageSize: 20,
      sortOrder: 'desc',
    });
  });

  it('validates page boundaries and sort direction', async () => {
    const dto = plainToInstance(PaginationQueryDto, {
      page: 0,
      pageSize: 101,
      sortOrder: 'oldest',
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(['page', 'pageSize', 'sortOrder']);
  });
});
