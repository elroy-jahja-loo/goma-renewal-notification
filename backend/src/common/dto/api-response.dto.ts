import { ApiProperty } from '@nestjs/swagger';

export class ApiResponseDto<T> {
  @ApiProperty()
  data: T;

  @ApiProperty({ example: 'Success' })
  message: string;

  constructor(data: T, message = 'Success') {
    this.data = data;
    this.message = message;
  }
}
