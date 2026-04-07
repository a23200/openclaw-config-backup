#import <Cocoa/Cocoa.h>

int main(int argc, const char * argv[]) {
    @autoreleasepool {
        if (argc < 3) {
            printf("Usage: %s <x> <y> [double]\n", argv[0]);
            return 1;
        }
        
        CGFloat x = atof(argv[1]);
        CGFloat y = atof(argv[2]);
        BOOL isDouble = (argc > 3);
        CGPoint pt = CGPointMake(x, y);
        
        CGEventRef mouseDown = CGEventCreateMouseEvent(NULL, kCGEventLeftMouseDown, pt, kCGMouseButtonLeft);
        CGEventPost(kCGHIDEventTap, mouseDown);
        usleep(50000); 
        CGEventRef mouseUp = CGEventCreateMouseEvent(NULL, kCGEventLeftMouseUp, pt, kCGMouseButtonLeft);
        CGEventPost(kCGHIDEventTap, mouseUp);
        
        if (isDouble) {
            usleep(100000); 
            CGEventSetIntegerValueField(mouseDown, kCGMouseEventClickState, 2);
            CGEventPost(kCGHIDEventTap, mouseDown);
            usleep(50000);
            CGEventSetIntegerValueField(mouseUp, kCGMouseEventClickState, 2);
            CGEventPost(kCGHIDEventTap, mouseUp);
        }
        
        CFRelease(mouseDown);
        CFRelease(mouseUp);
    }
    return 0;
}
